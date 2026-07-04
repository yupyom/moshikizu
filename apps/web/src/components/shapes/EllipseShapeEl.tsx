import type { EllipseShape } from '@draw/core';
import { strokeDashArray } from '@draw/core';
import { ShapeLabel } from './ShapeLabel';
import { useSettingsStore } from '../../store/settingsStore';

interface Props {
  shape: EllipseShape;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
}

export function EllipseShapeEl({ shape, selected, onPointerDown, onDoubleClick }: Props) {
  const font = useSettingsStore((s) => s.settings.font);
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  return (
    <g>
      <ellipse
        cx={cx}
        cy={cy}
        rx={shape.width / 2}
        ry={shape.height / 2}
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
        <ellipse
          data-ui="true"
          cx={cx}
          cy={cy}
          rx={shape.width / 2 + 1}
          ry={shape.height / 2 + 1}
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
