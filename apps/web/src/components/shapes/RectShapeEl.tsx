import type { RectShape } from '@draw/core';
import { strokeDashArray } from '@draw/core';
import { ShapeLabel } from './ShapeLabel';
import { useSettingsStore } from '../../store/settingsStore';

interface Props {
  shape: RectShape;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
}

export function RectShapeEl({ shape, selected, onPointerDown, onDoubleClick }: Props) {
  const font = useSettingsStore((s) => s.settings.font);
  return (
    <g>
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        fill={shape.fillColor}
        stroke={shape.strokeColor}
        strokeWidth={shape.strokeWidth}
        strokeDasharray={strokeDashArray(shape.strokeDash, shape.strokeWidth)}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        style={{ cursor: 'move' }}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      />
      {selected && (
        <rect
          data-ui="true"
          x={shape.x - 1}
          y={shape.y - 1}
          width={shape.width + 2}
          height={shape.height + 2}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'none' }}
        />
      )}
      {shape.label && (
        <ShapeLabel
          label={shape.label}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          font={font}
        />
      )}
    </g>
  );
}
