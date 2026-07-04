import { renderSvg } from '@draw/renderer';
import type { Shape, Canvas } from '@draw/core';
import { canvasBackgroundColor } from '@draw/core';
import { useDrawingStore } from '../store/drawingStore';
import { useSettingsStore } from '../store/settingsStore';
import { svgToPngBlob } from './exportPng';
import { buildEmbeddedFontCss } from './fonts';

/**
 * アプリ内MCPホスト（Electron main）からのツール呼び出しを、
 * 開いているドキュメント（drawingStore）に対して実行する。
 * 編集はすべて snapshot 付き（undoで巻き戻せる）で、画面に即時反映される。
 */

export function registerMcpBridge(): void {
  const bridge = window.drawDesktop;
  if (!bridge?.onMcpRequest || !bridge.sendMcpResponse) return;
  bridge.onMcpRequest(async (msg) => {
    try {
      const result = await execute(msg.op, msg.args);
      bridge.sendMcpResponse!({ id: msg.id, result });
    } catch (err) {
      bridge.sendMcpResponse!({ id: msg.id, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

function resolveCanvas(canvasId: unknown): Canvas {
  const st = useDrawingStore.getState();
  const id = typeof canvasId === 'string' ? canvasId : st.activeCanvasId;
  const canvas = st.canvases.find((c) => c.id === id);
  if (!canvas) throw new Error(`キャンバスが見つかりません: ${id}`);
  return canvas;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function execute(op: string, args: Record<string, unknown>): Promise<unknown> {
  const store = useDrawingStore.getState();
  const settings = useSettingsStore.getState().settings;

  switch (op) {
    case 'get_document':
      return {
        name: store.projectName,
        activeCanvasId: store.activeCanvasId,
        canvases: store.canvases.map((c) => ({
          ...c,
          shapeCount: store.shapes.filter((s) => s.canvasId === c.id).length,
        })),
      };

    case 'list_shapes': {
      const canvas = resolveCanvas(args.canvasId);
      return store.shapes.filter((s) => s.canvasId === canvas.id);
    }

    case 'add_shapes': {
      const canvas = resolveCanvas(args.canvasId);
      const input = args.shapes as Shape[];
      if (!Array.isArray(input) || input.some((s) => typeof s.type !== 'string')) {
        throw new Error('shapes には type を持つ図形の配列を指定してください');
      }
      const shapes = input.map((s) => ({
        ...s,
        id: s.id ?? crypto.randomUUID(),
        canvasId: canvas.id,
      })) as Shape[];
      store.snapshot();
      useDrawingStore.setState((st) => ({ shapes: [...st.shapes, ...shapes] }));
      return { addedIds: shapes.map((s) => s.id) };
    }

    case 'update_shape': {
      const id = args.id as string;
      if (!store.shapes.some((s) => s.id === id)) throw new Error(`図形が見つかりません: ${id}`);
      store.snapshot();
      store.updateShape(id, args.patch as Partial<Shape>);
      return useDrawingStore.getState().shapes.find((s) => s.id === id);
    }

    case 'delete_shapes': {
      const ids = new Set(args.ids as string[]);
      store.snapshot();
      useDrawingStore.setState((st) => ({
        shapes: st.shapes.filter((s) => !ids.has(s.id)),
        selectedIds: new Set<string>(),
      }));
      return { shapeCount: useDrawingStore.getState().shapes.length };
    }

    case 'add_canvas': {
      store.addCanvas(args.name as string | undefined);
      const st = useDrawingStore.getState();
      const canvas = st.canvases[st.canvases.length - 1];
      if (typeof args.width === 'number' || typeof args.height === 'number') {
        st.updateCanvas(canvas.id, {
          width: (args.width as number) ?? canvas.width,
          height: (args.height as number) ?? canvas.height,
        });
      }
      return useDrawingStore.getState().canvases.at(-1);
    }

    case 'update_canvas': {
      const id = args.id as string;
      if (!store.canvases.some((c) => c.id === id)) throw new Error(`キャンバスが見つかりません: ${id}`);
      store.snapshot();
      store.updateCanvas(id, args.patch as Partial<Canvas>);
      return useDrawingStore.getState().canvases.find((c) => c.id === id);
    }

    case 'render_svg':
    case 'render_png': {
      const canvas = resolveCanvas(args.canvasId);
      const st = useDrawingStore.getState();
      const shapes = st.shapes.filter((s) => s.canvasId === canvas.id);
      const fit = args.fit === true;
      let embedCss: string | undefined;
      if (op === 'render_png') {
        const docText = shapes.map((s) => (s.type === 'text' ? s.text : s.label?.text ?? '')).join('');
        embedCss = await buildEmbeddedFontCss(settings.font, docText).catch(() => undefined);
      }
      const svg = renderSvg(shapes, {
        font: settings.font,
        fontImport: false,
        embedCss: embedCss || undefined,
        assets: st.assets,
        allShapes: st.shapes,
        ...(fit
          ? {}
          : {
              viewBox: { x: 0, y: 0, width: canvas.width, height: canvas.height },
              background: canvasBackgroundColor(canvas),
            }),
      });
      if (!svg) throw new Error('描画する図形がありません');
      if (op === 'render_svg') return { svg };
      const blob = await svgToPngBlob(svg, (args.scale as number) ?? 1);
      return { pngBase64: await blobToBase64(blob) };
    }

    default:
      throw new Error(`未知の操作: ${op}`);
  }
}
