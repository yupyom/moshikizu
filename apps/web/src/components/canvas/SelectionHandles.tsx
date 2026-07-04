import type { BoundingBox, HandlePosition } from '@draw/core';

interface Props {
  box: BoundingBox;
  onHandlePointerDown: (pos: HandlePosition, e: React.PointerEvent) => void;
}

const HANDLE_SIZE = 8;

const HANDLES: { pos: HandlePosition; cx: (b: BoundingBox) => number; cy: (b: BoundingBox) => number }[] = [
  { pos: 'nw', cx: (b) => b.x,              cy: (b) => b.y               },
  { pos: 'n',  cx: (b) => b.x + b.width / 2, cy: (b) => b.y               },
  { pos: 'ne', cx: (b) => b.x + b.width,    cy: (b) => b.y               },
  { pos: 'w',  cx: (b) => b.x,              cy: (b) => b.y + b.height / 2 },
  { pos: 'e',  cx: (b) => b.x + b.width,    cy: (b) => b.y + b.height / 2 },
  { pos: 'sw', cx: (b) => b.x,              cy: (b) => b.y + b.height     },
  { pos: 's',  cx: (b) => b.x + b.width / 2, cy: (b) => b.y + b.height     },
  { pos: 'se', cx: (b) => b.x + b.width,    cy: (b) => b.y + b.height     },
];

const CURSORS: Record<HandlePosition, string> = {
  nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize',
  w: 'w-resize', e: 'e-resize',
  sw: 'sw-resize', s: 's-resize', se: 'se-resize',
};

export function SelectionHandles({ box, onHandlePointerDown }: Props) {
  return (
    <g data-ui="true">
      {/* 選択枠 */}
      <rect
        x={box.x - 1}
        y={box.y - 1}
        width={box.width + 2}
        height={box.height + 2}
        fill="none"
        stroke="#2563eb"
        strokeWidth={1}
        strokeDasharray="4 2"
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: 'none' }}
      />
      {HANDLES.map(({ pos, cx, cy }) => (
        <rect
          key={pos}
          x={cx(box) - HANDLE_SIZE / 2}
          y={cy(box) - HANDLE_SIZE / 2}
          width={HANDLE_SIZE}
          height={HANDLE_SIZE}
          fill="#fff"
          stroke="#2563eb"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: CURSORS[pos] }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onHandlePointerDown(pos, e);
          }}
        />
      ))}
    </g>
  );
}
