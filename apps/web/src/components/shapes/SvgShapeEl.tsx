import type { SvgShape } from '@draw/core';

interface Props {
  shape: SvgShape;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}

export function SvgShapeEl({ shape, selected, onPointerDown }: Props) {
  return (
    <g>
      <image
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        href={`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(shape.svgContent)))}`}
        style={{ cursor: 'move' }}
        onPointerDown={onPointerDown}
      />
      {selected && (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          strokeDasharray="4 2"
          vectorEffect="non-scaling-stroke"
          data-ui="true"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
}
