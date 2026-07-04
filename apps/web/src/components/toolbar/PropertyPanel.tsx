import { useDrawingStore } from '../../store/drawingStore';
import { useSettingsStore } from '../../store/settingsStore';
import { ColorPalette } from './ColorPalette';
import { AlignmentBar } from './AlignmentBar';
import type { Shape, Canvas, MarkerType, FontWeight, StrokeDash, LinePathStyle, AssetInstanceShape, TableShape, ChartShape, ChartType } from '@draw/core';
import { CANVAS_PRESETS, resolveAssetInstance, getBoundingBox, moveShape } from '@draw/core';
import styles from './PropertyPanel.module.css';

const MIN_STROKE_WIDTH = 0.5;
const MAX_STROKE_WIDTH = 40;
const MIN_MARKER_SIZE = 0.5;
const MAX_MARKER_SIZE = 4;

export function PropertyPanel() {
  const store = useDrawingStore();
  const settings = useSettingsStore((s) => s.settings);

  const selected = store.shapes.filter((s) => store.selectedIds.has(s.id));
  if (selected.length === 0) return <CanvasProperties />;

  const first = selected[0];
  const isSingle = selected.length === 1;

  // 型の絞り込み用
  const line = first.type === 'line' ? first : null;
  const text = first.type === 'text' ? first : null;
  const fillShape =
    first.type === 'rect' || first.type === 'roundedRect' || first.type === 'ellipse'
      ? first
      : null;

  const isText = text !== null;
  // SVG配置・画像・アセットインスタンスには線スタイルやラベルの概念がない
  const isAsset = first.type === 'svg' || first.type === 'image' || first.type === 'assetInstance' || first.type === 'table' || first.type === 'chart';
  const hasStroke = !isText && !isAsset;
  const hasLabel = !isText && !isAsset;

  const update = (patch: Partial<Shape>) => {
    store.snapshot();
    selected.forEach((s) => store.updateShape(s.id, patch));
  };

  const updateLabel = (patch: Partial<NonNullable<Shape['label']>>) => {
    store.snapshot();
    selected.forEach((s) => {
      const label = s.label ?? {
        text: '', fontSize: settings.fontSizes[4], fontWeight: 'regular' as const, hAlign: 'center' as const, vAlign: 'middle' as const, color: settings.colorPalette[0],
      };
      store.updateShape(s.id, { label: { ...label, ...patch } });
    });
  };

  const setStrokeWidth = (v: number) => {
    if (!Number.isFinite(v) || v <= 0) return;
    update({ strokeWidth: Math.min(Math.max(v, MIN_STROKE_WIDTH), MAX_STROKE_WIDTH) });
  };

  const setMarkerSize = (v: number) => {
    if (!Number.isFinite(v) || v <= 0) return;
    update({ markerSize: Math.min(Math.max(v, MIN_MARKER_SIZE), MAX_MARKER_SIZE) });
  };

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <AlignmentBar />
      </div>

      {/* 位置とサイズ（単一選択時） */}
      {isSingle && (() => {
        const bb = getBoundingBox(first);
        const hasSize = first.type !== 'line' && first.type !== 'text';
        const move = (dx: number, dy: number) => {
          if (dx === 0 && dy === 0) return;
          store.snapshot();
          store.updateShape(first.id, moveShape(first, dx, dy));
        };
        const resize = (key: 'width' | 'height', v: number) => {
          if (!Number.isFinite(v) || v < 5) return;
          store.snapshot();
          store.updateShape(first.id, { [key]: Math.round(v) } as Partial<Shape>);
        };
        return (
          <div className={styles.section}>
            <span className={styles.label}>位置とサイズ</span>
            <div className={styles.row}>
              <span className={styles.unit}>X</span>
              <input type="number" className={styles.numInput} value={Math.round(bb.x)}
                onChange={(e) => move(Number(e.target.value) - bb.x, 0)} />
              <span className={styles.unit}>Y</span>
              <input type="number" className={styles.numInput} value={Math.round(bb.y)}
                onChange={(e) => move(0, Number(e.target.value) - bb.y)} />
            </div>
            {hasSize && (
              <div className={styles.row}>
                <span className={styles.unit}>W</span>
                <input type="number" className={styles.numInput} value={Math.round(bb.width)} min={5}
                  onChange={(e) => resize('width', Number(e.target.value))} />
                <span className={styles.unit}>H</span>
                <input type="number" className={styles.numInput} value={Math.round(bb.height)} min={5}
                  onChange={(e) => resize('height', Number(e.target.value))} />
              </div>
            )}
            {first.type !== 'line' && (
              <div className={styles.row}>
                <span className={styles.unit}>回転</span>
                <input type="number" className={styles.numInput} value={first.rotation ?? 0}
                  min={-360} max={360} step={5}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    store.snapshot();
                    store.updateShape(first.id, { rotation: v % 360 === 0 ? undefined : v });
                  }} />
                <span className={styles.unit}>°</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* 線色 */}
      {!isAsset && (
        <div className={styles.section}>
          <ColorPalette
            label="線色"
            colors={settings.colorPalette}
            value={first.strokeColor}
            onChange={(color) => update({ strokeColor: color })}
            allowNone
          />
        </div>
      )}

      {/* 線幅: プリセット + カスタム数値 */}
      {hasStroke && (
        <div className={styles.section}>
          <span className={styles.label}>線幅</span>
          <div className={styles.row}>
            {settings.strokeWidths.map((w) => (
              <button
                key={w}
                className={`${styles.widthBtn} ${first.strokeWidth === w ? styles.active : ''}`}
                onClick={() => update({ strokeWidth: w })}
                title={`${w}px`}
              >
                <span style={{ display: 'block', height: w, background: 'currentColor', borderRadius: 1 }} />
              </button>
            ))}
            <input
              type="number"
              className={styles.numInput}
              value={first.strokeWidth}
              min={MIN_STROKE_WIDTH}
              max={MAX_STROKE_WIDTH}
              step={0.5}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              title="カスタム線幅"
            />
            <span className={styles.unit}>px</span>
          </div>
        </div>
      )}

      {/* 線種（実線・破線・点線） */}
      {hasStroke && (
        <div className={styles.section}>
          <span className={styles.label}>線種</span>
          <select
            className={styles.select}
            value={first.strokeDash ?? 'solid'}
            onChange={(e) => update({ strokeDash: e.target.value as StrokeDash })}
          >
            <option value="solid">実線</option>
            <option value="dashed">破線</option>
            <option value="dotted">点線</option>
            <option value="dashdot">一点鎖線</option>
          </select>
        </div>
      )}

      {/* 塗り色 */}
      {fillShape && (
        <div className={styles.section}>
          <ColorPalette
            label="塗り"
            colors={settings.colorPalette}
            value={fillShape.fillColor}
            onChange={(color) => update({ fillColor: color })}
            allowNone
          />
        </div>
      )}

      {/* 角丸半径 */}
      {isSingle && first.type === 'roundedRect' && (
        <div className={styles.section}>
          <span className={styles.label}>角丸</span>
          <input
            type="number"
            className={styles.numInput}
            value={first.cornerRadius}
            min={0}
            max={100}
            onChange={(e) => update({ cornerRadius: Number(e.target.value) })}
          />
          <span className={styles.unit}>px</span>
        </div>
      )}

      {/* 線パス（折れ線/曲線） */}
      {line && (
        <div className={styles.section}>
          <span className={styles.label}>パス</span>
          <select
            className={styles.select}
            value={line.pathStyle ?? 'orthogonal'}
            onChange={(e) => update({ pathStyle: e.target.value as LinePathStyle })}
          >
            <option value="orthogonal">折れ線（直角）</option>
            <option value="curve">曲線</option>
          </select>
        </div>
      )}

      {/* 線端マーカー */}
      {line && isSingle && (
        <>
          <div className={styles.section}>
            <span className={styles.label}>始端</span>
            <MarkerSelect value={line.startMarker} onChange={(v) => update({ startMarker: v })} />
            <span className={styles.label} style={{ marginLeft: 8 }}>終端</span>
            <MarkerSelect value={line.endMarker} onChange={(v) => update({ endMarker: v })} />
          </div>
          <div className={styles.section}>
            <span className={styles.label}>先端サイズ</span>
            <input
              type="number"
              className={styles.numInput}
              value={line.markerSize ?? 1}
              min={MIN_MARKER_SIZE}
              max={MAX_MARKER_SIZE}
              step={0.5}
              onChange={(e) => setMarkerSize(Number(e.target.value))}
            />
            <span className={styles.unit}>×</span>
          </div>
        </>
      )}

      {/* テキスト色 */}
      {text && (
        <div className={styles.section}>
          <ColorPalette
            label="色"
            colors={settings.colorPalette}
            value={text.color}
            onChange={(color) => update({ color })}
          />
        </div>
      )}

      {/* 段落（テキストのみ） */}
      {text && (
        <div className={styles.section}>
          <span className={styles.label}>段落</span>
          <div className={styles.row}>
            <span className={styles.unit}>行揃え</span>
            <select
              className={styles.select}
              value={text.align ?? 'left'}
              onChange={(e) => update({ align: e.target.value as typeof text.align })}
            >
              <option value="left">左</option>
              <option value="center">中央</option>
              <option value="right">右</option>
            </select>
            <span className={styles.unit}>行間</span>
            <input
              type="number"
              className={styles.numInput}
              style={{ width: 56 }}
              value={text.lineHeight ?? 1.4}
              min={1}
              max={3}
              step={0.1}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v) || v < 0.8 || v > 4) return;
                update({ lineHeight: v });
              }}
            />
          </div>
          <div className={styles.row}>
            <span className={styles.unit}>リスト</span>
            <select
              className={styles.select}
              value={text.listStyle ?? 'none'}
              onChange={(e) => update({ listStyle: e.target.value as typeof text.listStyle })}
            >
              <option value="none">なし</option>
              <option value="bullet">記号</option>
              <option value="number">番号</option>
            </select>
            {text.listStyle === 'bullet' && (
              <>
                <span className={styles.unit}>行頭文字</span>
                <input
                  type="text"
                  className={styles.numInput}
                  style={{ width: 48 }}
                  value={text.bullet ?? '•'}
                  maxLength={2}
                  onChange={(e) => update({ bullet: e.target.value || '•' })}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* フォントサイズ */}
      {(isText || hasLabel) && (
        <div className={styles.section}>
          <span className={styles.label}>{isText ? 'サイズ' : 'ラベルサイズ'}</span>
          <select
            className={styles.select}
            value={String(text ? text.fontSize : (first.label?.fontSize ?? settings.fontSizes[4]))}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) return;
              if (text) update({ fontSize: v });
              else updateLabel({ fontSize: v });
            }}
          >
            {settings.fontSizes.map((s) => (
              <option key={s} value={String(s)}>{s}px</option>
            ))}
            {!settings.fontSizes.includes(text ? text.fontSize : (first.label?.fontSize ?? settings.fontSizes[4])) && (
              <option value={String(text ? text.fontSize : first.label?.fontSize)}>
                {text ? text.fontSize : first.label?.fontSize}px
              </option>
            )}
          </select>
          <input
            type="number"
            className={styles.numInput}
            style={{ width: 56 }}
            value={text ? text.fontSize : (first.label?.fontSize ?? settings.fontSizes[4])}
            min={6}
            max={400}
            title="カスタムサイズ（px）"
            onChange={(e) => {
              const v = Math.min(Math.max(Number(e.target.value), 6), 400);
              if (!Number.isFinite(v)) return;
              if (text) update({ fontSize: v });
              else updateLabel({ fontSize: v });
            }}
          />
          <button
            className={`${styles.fwBtn} ${(text ? text.fontWeight : first.label?.fontWeight) === 'bold' ? styles.active : ''}`}
            onClick={() => {
              const curr = text ? text.fontWeight : first.label?.fontWeight ?? 'regular';
              const next: FontWeight = curr === 'bold' ? 'regular' : 'bold';
              if (text) update({ fontWeight: next });
              else updateLabel({ fontWeight: next });
            }}
          >
            B
          </button>
        </div>
      )}

      {/* ラベル文字色 */}
      {hasLabel && first.label && (
        <div className={styles.section}>
          <ColorPalette
            label="文字色"
            colors={settings.colorPalette}
            value={first.label.color}
            onChange={(color) => updateLabel({ color })}
          />
        </div>
      )}

      {/* アセットインスタンス: テキストプレースホルダーの差し替え */}
      {isSingle && first.type === 'assetInstance' && <InstanceOverrides inst={first} />}

      {/* 表の編集 */}
      {isSingle && first.type === 'table' && <TableProperties table={first} />}

      {/* グラフの設定 */}
      {isSingle && first.type === 'chart' && <ChartProperties chart={first} />}

      {/* メモ（単一選択時のみ。書き出しには含まれない） */}
      {isSingle && (
        <div className={styles.section}>
          <span className={styles.label}>メモ（書き出しに含まれません）</span>
          <textarea
            key={first.id}
            className={styles.memoArea}
            defaultValue={first.memo ?? ''}
            placeholder="この図形についての注記…"
            rows={3}
            onBlur={(e) => {
              const memo = e.target.value.trim();
              if ((first.memo ?? '') === memo) return;
              store.snapshot();
              store.updateShape(first.id, { memo: memo || undefined });
            }}
          />
        </div>
      )}
    </div>
  );
}

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: 'bar', label: '棒' },
  { value: 'line', label: '折れ線' },
  { value: 'pie', label: '円' },
  { value: 'donut', label: 'ドーナツ' },
  { value: 'radar', label: 'レーダー' },
  { value: 'scatter', label: '散布図（1列目=X）' },
  { value: 'waterfall', label: 'ウォーターフォール' },
];

/** グラフの設定（参照表・種類・範囲） */
function ChartProperties({ chart }: { chart: ChartShape }) {
  const store = useDrawingStore();
  const tables = store.shapes.filter((s): s is TableShape => s.type === 'table');

  const commit = (patch: Partial<ChartShape>) => {
    store.snapshot();
    store.updateShape(chart.id, patch as Partial<Shape>);
  };

  return (
    <>
      <div className={styles.section}>
        <span className={styles.label}>グラフの種類</span>
        <select
          className={styles.select}
          value={chart.chartType}
          onChange={(e) => commit({ chartType: e.target.value as ChartType })}
        >
          {CHART_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className={styles.section}>
        <span className={styles.label}>参照する表（キャンバス跨ぎ可）</span>
        <select
          className={styles.select}
          value={chart.tableId}
          onChange={(e) => commit({ tableId: e.target.value })}
        >
          {tables.map((t, i) => {
            const canvas = store.canvases.find((c) => c.id === t.canvasId);
            return (
              <option key={t.id} value={t.id}>
                表{i + 1}（{t.rowHeights.length}×{t.colWidths.length}・{canvas?.name ?? '?'}）
              </option>
            );
          })}
          {!tables.some((t) => t.id === chart.tableId) && (
            <option value={chart.tableId}>（参照先が見つかりません）</option>
          )}
        </select>
        <div className={styles.row}>
          <span className={styles.unit}>範囲</span>
          <input
            type="text"
            className={styles.numInput}
            style={{ width: 100 }}
            placeholder="例: A1:C4"
            defaultValue={chart.dataRange ?? ''}
            key={chart.id + (chart.dataRange ?? '')}
            onBlur={(e) => commit({ dataRange: e.target.value.trim() || undefined })}
          />
        </div>
      </div>
      <div className={styles.section}>
        <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={chart.firstRowIsHeader ?? true}
            onChange={(e) => commit({ firstRowIsHeader: e.target.checked })}
          />
          先頭行を系列名にする
        </label>
        <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={chart.firstColIsLabels ?? true}
            onChange={(e) => commit({ firstColIsLabels: e.target.checked })}
          />
          先頭列をラベルにする
        </label>
        <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={chart.showLegend ?? true}
            onChange={(e) => commit({ showLegend: e.target.checked })}
          />
          凡例を表示
        </label>
      </div>
    </>
  );
}

/** 表の編集（行列操作・統一化・罫線・ヘッダー/フッター） */
function TableProperties({ table }: { table: TableShape }) {
  const store = useDrawingStore();

  const commit = (patch: Partial<TableShape>) => {
    store.snapshot();
    store.updateShape(table.id, patch as Partial<Shape>);
  };

  const rows = table.rowHeights.length;
  const cols = table.colWidths.length;

  const addRow = () => commit({
    rowHeights: [...table.rowHeights, table.rowHeights[rows - 1] ?? 32],
    cells: [...table.cells, Array(cols).fill('')],
  });
  const removeRow = () => {
    if (rows <= 1) return;
    commit({ rowHeights: table.rowHeights.slice(0, -1), cells: table.cells.slice(0, -1) });
  };
  const addCol = () => commit({
    colWidths: [...table.colWidths, table.colWidths[cols - 1] ?? 120],
    cells: table.cells.map((r) => [...r, '']),
  });
  const removeCol = () => {
    if (cols <= 1) return;
    commit({ colWidths: table.colWidths.slice(0, -1), cells: table.cells.map((r) => r.slice(0, -1)) });
  };
  const uniformRows = () => {
    const avg = table.rowHeights.reduce((a, b) => a + b, 0) / rows;
    commit({ rowHeights: table.rowHeights.map(() => Math.round(avg)) });
  };
  const uniformCols = () => {
    const avg = table.colWidths.reduce((a, b) => a + b, 0) / cols;
    commit({ colWidths: table.colWidths.map(() => Math.round(avg)) });
  };

  const btn: React.CSSProperties = { padding: '3px 8px', fontSize: 12 };

  return (
    <>
      <div className={styles.section}>
        <span className={styles.label}>表（{rows}行 × {cols}列）— ダブルクリックでセル編集、=で数式</span>
        <div className={styles.row}>
          <button className={styles.fwBtn} style={btn} onClick={addRow}>行+</button>
          <button className={styles.fwBtn} style={btn} onClick={removeRow}>行−</button>
          <button className={styles.fwBtn} style={btn} onClick={addCol}>列+</button>
          <button className={styles.fwBtn} style={btn} onClick={removeCol}>列−</button>
        </div>
        <div className={styles.row}>
          <button className={styles.fwBtn} style={{ ...btn, width: 'auto' }} onClick={uniformRows}>行高を揃える</button>
          <button className={styles.fwBtn} style={{ ...btn, width: 'auto' }} onClick={uniformCols}>列幅を揃える</button>
        </div>
      </div>
      <div className={styles.section}>
        <span className={styles.label}>ヘッダー / フッター（行数・列数）</span>
        <div className={styles.row}>
          {([
            ['H行', 'headerRows'],
            ['H列', 'headerCols'],
            ['F行', 'footerRows'],
            ['F列', 'footerCols'],
          ] as const).map(([lab, key]) => (
            <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span className={styles.unit}>{lab}</span>
              <input
                type="number"
                className={styles.numInput}
                style={{ width: 44 }}
                min={0}
                max={3}
                value={table[key] ?? 0}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(3, Number(e.target.value)));
                  commit({ [key]: v || undefined } as Partial<TableShape>);
                }}
              />
            </span>
          ))}
        </div>
      </div>
      <div className={styles.section}>
        <span className={styles.label}>罫線・スタイル</span>
        <div className={styles.row}>
          <input
            type="color"
            value={table.borderColor ?? '#9ca3af'}
            onChange={(e) => commit({ borderColor: e.target.value })}
            style={{ width: 30, height: 24, padding: 0, border: '1px solid #ccc', borderRadius: 4 }}
            title="罫線の色"
          />
          <input
            type="number"
            className={styles.numInput}
            style={{ width: 52 }}
            min={0.5}
            max={6}
            step={0.5}
            value={table.borderWidth ?? 1}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v > 0) commit({ borderWidth: v });
            }}
            title="罫線の太さ"
          />
          <input
            type="color"
            value={table.headerFill ?? '#eef2f7'}
            onChange={(e) => commit({ headerFill: e.target.value })}
            style={{ width: 30, height: 24, padding: 0, border: '1px solid #ccc', borderRadius: 4 }}
            title="ヘッダー/フッターの塗り"
          />
          <span className={styles.unit}>文字</span>
          <input
            type="number"
            className={styles.numInput}
            style={{ width: 52 }}
            min={8}
            max={40}
            value={table.fontSize ?? 13}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 6) commit({ fontSize: v });
            }}
            title="フォントサイズ"
          />
        </div>
      </div>
    </>
  );
}

/** アセットインスタンスのテキスト差し替え（オーバーライド編集） */
function InstanceOverrides({ inst }: { inst: AssetInstanceShape }) {
  const store = useDrawingStore();
  const resolved = resolveAssetInstance(inst, store.assets);
  if (!resolved) {
    return (
      <div className={styles.section}>
        <span className={styles.label}>参照先のアセットが見つかりません</span>
      </div>
    );
  }
  // テキストを持つサブ図形 = プレースホルダー
  const slots = resolved.shapes.filter((s) => s.type === 'text' || s.label?.text);

  const commit = (sub: Shape, text: string) => {
    const patch: Partial<Shape> =
      sub.type === 'text' ? { text } : { label: { ...sub.label!, text } };
    store.snapshot();
    store.updateShape(inst.id, {
      overrides: { ...inst.overrides, [sub.id]: patch },
    });
  };

  const hasOverrides = inst.overrides && Object.keys(inst.overrides).length > 0;

  return (
    <div className={styles.section}>
      <span className={styles.label}>アセット「{resolved.master.name}」のテキスト</span>
      {slots.length === 0 && <span className={styles.hint} style={{ margin: 0, textAlign: 'left' }}>差し替え可能なテキストはありません</span>}
      {slots.map((sub) => {
        const current = sub.type === 'text' ? sub.text : sub.label?.text ?? '';
        return (
          <input
            key={`${sub.id}:${current}`}
            className={styles.textInput}
            defaultValue={current}
            onBlur={(e) => {
              if (e.target.value !== current) commit(sub, e.target.value);
            }}
          />
        );
      })}
      {hasOverrides && (
        <button
          className={styles.fwBtn}
          style={{ width: 'auto', padding: '0 10px', alignSelf: 'flex-start' }}
          onClick={() => {
            store.snapshot();
            store.updateShape(inst.id, { overrides: undefined });
          }}
          title="差し替えを破棄してマスターの内容に戻す"
        >
          マスターに戻す
        </button>
      )}
    </div>
  );
}

/** 何も選択していないとき: アクティブキャンバスの設定を表示 */
function CanvasProperties() {
  const store = useDrawingStore();
  const settings = useSettingsStore((s) => s.settings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const canvas = store.canvases.find((c) => c.id === store.activeCanvasId);
  if (!canvas) return <div className={styles.panel} />;

  const update = (patch: Partial<Canvas>) => store.updateCanvas(canvas.id, patch);

  const setSize = (key: 'width' | 'height', v: number) => {
    if (!Number.isFinite(v) || v < 100 || v > 10000) return;
    update({ [key]: Math.round(v) });
  };

  return (
    <div className={styles.panel}>
      <p className={styles.hint}>キャンバス設定</p>
      <div className={styles.section}>
        <span className={styles.label}>名前</span>
        <input
          type="text"
          className={styles.textInput}
          value={canvas.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </div>
      <div className={styles.section}>
        <span className={styles.label}>サイズプリセット</span>
        <select
          className={styles.select}
          value={
            CANVAS_PRESETS.find((p) => p.width === canvas.width && p.height === canvas.height)?.label ?? '__custom__'
          }
          onChange={(e) => {
            const preset = CANVAS_PRESETS.find((p) => p.label === e.target.value);
            if (preset) update({ width: preset.width, height: preset.height });
          }}
        >
          {CANVAS_PRESETS.map((p) => (
            <option key={p.label} value={p.label}>{p.label}</option>
          ))}
          <option value="__custom__">カスタム</option>
        </select>
      </div>
      <div className={styles.section}>
        <span className={styles.label}>幅</span>
        <input
          type="number"
          className={styles.numInput}
          value={canvas.width}
          min={100}
          max={10000}
          step={10}
          onChange={(e) => setSize('width', Number(e.target.value))}
        />
        <span className={styles.label} style={{ marginLeft: 8 }}>高さ</span>
        <input
          type="number"
          className={styles.numInput}
          value={canvas.height}
          min={100}
          max={10000}
          step={10}
          onChange={(e) => setSize('height', Number(e.target.value))}
        />
        <span className={styles.unit}>px</span>
      </div>
      <div className={styles.section}>
        <span className={styles.label}>背景</span>
        <div className={styles.row}>
          <input
            type="color"
            value={canvas.background === 'transparent' ? '#ffffff' : (canvas.background ?? '#ffffff')}
            disabled={canvas.background === 'transparent'}
            onChange={(e) => update({ background: e.target.value })}
            style={{ width: 32, height: 26, padding: 0, border: '1px solid #ccc', borderRadius: 4 }}
          />
          <button
            className={styles.fwBtn}
            style={{ width: 'auto', padding: '0 8px' }}
            onClick={() => update({ background: undefined })}
            title="背景色をデフォルト（白）に戻す"
          >
            白
          </button>
          <button
            className={`${styles.fwBtn} ${canvas.background === 'transparent' ? styles.active : ''}`}
            style={{ width: 'auto', padding: '0 8px' }}
            onClick={() =>
              update({ background: canvas.background === 'transparent' ? undefined : 'transparent' })
            }
            title="背景を透明にする（PNG書き出しはアルファ付きになります）"
          >
            透明
          </button>
        </div>
      </div>
      <div className={styles.section}>
        <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!canvas.isMaster}
            onChange={(e) => update({ isMaster: e.target.checked || undefined, masterId: undefined })}
          />
          マスターキャンバスにする（ページに数えない・共通要素用）
        </label>
        {!canvas.isMaster && (
          <div className={styles.row}>
            <span className={styles.unit}>適用マスター</span>
            <select
              className={styles.select}
              value={canvas.masterId ?? ''}
              onChange={(e) => update({ masterId: e.target.value || undefined })}
            >
              <option value="">なし</option>
              {store.canvases.filter((c) => c.isMaster).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        <span className={styles.hint} style={{ margin: 0, textAlign: 'left' }}>
          マスター上のテキストの {'{page}'} {'{pages}'} {'{canvas}'} はページ番号等に置換されます
        </span>
      </div>
      <div className={styles.section}>
        <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.showGrid}
            onChange={(e) => saveSettings({ ...settings, showGrid: e.target.checked })}
          />
          グリッドを表示（書き出しには含まれません）
        </label>
      </div>
      <div className={styles.section}>
        <span className={styles.label}>メモ（書き出しに含まれません）</span>
        <textarea
          key={canvas.id}
          className={styles.memoArea}
          defaultValue={canvas.memo ?? ''}
          placeholder="このキャンバスについての注記…"
          rows={3}
          onBlur={(e) => {
            const memo = e.target.value.trim();
            if ((canvas.memo ?? '') === memo) return;
            update({ memo: memo || undefined });
          }}
        />
      </div>
      <p className={styles.hint} style={{ marginTop: 8 }}>
        「キャンバスSVG/PNG」書き出しはこの寸法・背景で切り出されます
      </p>
    </div>
  );
}

function MarkerSelect({ value, onChange }: { value: MarkerType; onChange: (v: MarkerType) => void }) {
  return (
    <select
      style={{ fontSize: 13, padding: '4px 6px', borderRadius: 4, border: '1px solid #ccc' }}
      value={value}
      onChange={(e) => onChange(e.target.value as MarkerType)}
    >
      <option value="none">なし</option>
      <option value="arrow">矢印</option>
      <option value="triangle">三角</option>
      <option value="square">四角</option>
      <option value="circle">丸</option>
      <option value="diamond">菱形</option>
      <option value="bar">バー</option>
    </select>
  );
}
