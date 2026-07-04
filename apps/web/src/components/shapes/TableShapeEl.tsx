import type { TableShape } from '@draw/core';
import { tableLayout } from '@draw/core';
import { renderShapesFragment } from '@draw/renderer';
import { useSettingsStore } from '../../store/settingsStore';

interface Props {
  shape: TableShape;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}

/**
 * 表。描画は renderer のフラグメントを利用（書き出しと見た目を統一）。
 * セル編集は DrawingCanvas 側のダブルクリック→セル特定→オーバーレイで行う。
 */
export function TableShapeEl({ shape, selected, onPointerDown }: Props) {
  const font = useSettingsStore((s) => s.settings.font);
  const html = renderShapesFragment([shape], font);
  const layout = tableLayout(shape.colWidths, shape.rowHeights);

  return (
    <g>
      <g style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: html }} />
      {/* ヒット領域 */}
      <rect
        x={shape.x}
        y={shape.y}
        width={layout.width}
        height={layout.height}
        fill="transparent"
        style={{ cursor: 'move' }}
        onPointerDown={onPointerDown}
      />
      {selected && (
        <rect
          data-ui="true"
          x={shape.x}
          y={shape.y}
          width={layout.width}
          height={layout.height}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
}
