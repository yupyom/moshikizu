import type { ChartShape, Shape } from '@draw/core';
import { renderShapesFragment } from '@draw/renderer';
import { useSettingsStore } from '../../store/settingsStore';

interface Props {
  shape: ChartShape;
  allShapes: Shape[];
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}

/** グラフ。表参照を allShapes（全キャンバス）から解決するので、キャンバス跨ぎの参照が可能 */
export function ChartShapeEl({ shape, allShapes, selected, onPointerDown }: Props) {
  const font = useSettingsStore((s) => s.settings.font);
  const html = renderShapesFragment([shape], font, [], allShapes);
  return (
    <g>
      <g style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: html }} />
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        fill="transparent"
        style={{ cursor: 'move' }}
        onPointerDown={onPointerDown}
      />
      {selected && (
        <rect
          data-ui="true"
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
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
