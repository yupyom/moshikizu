import type { TextShape } from '@draw/core';
import { useSettingsStore } from '../../store/settingsStore';

interface Props {
  shape: TextShape;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
}

function estimateLineWidth(line: string, fontSize: number): number {
  let width = 0;
  for (const char of line) {
    const code = char.charCodeAt(0);
    width += code >= 0x3000 ? fontSize : fontSize * 0.6;
  }
  return width;
}

function linePrefix(shape: { listStyle?: 'none' | 'bullet' | 'number'; bullet?: string }, i: number): string {
  if (shape.listStyle === 'bullet') return `${shape.bullet ?? '•'} `;
  if (shape.listStyle === 'number') return `${i + 1}. `;
  return '';
}

export function TextShapeEl({ shape, selected, onPointerDown, onDoubleClick }: Props) {
  const font = useSettingsStore((s) => s.settings.font);
  const lines = shape.text.split('\n');
  const lineHeight = shape.fontSize * (shape.lineHeight ?? 1.4);
  const anchor = shape.align === 'center' ? 'middle' : shape.align === 'right' ? 'end' : 'start';
  const hitWidth = Math.max(...lines.map((l) => estimateLineWidth(l, shape.fontSize)), 20) + 8;
  const hitHeight = lines.length * lineHeight + 8;
  const hitX = shape.x - 4;
  const hitY = shape.y - shape.fontSize - 4;

  return (
    <g
      style={{ cursor: 'move' }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      {/* ヒット領域（常に透明） */}
      <rect
        x={hitX}
        y={hitY}
        width={hitWidth}
        height={hitHeight}
        fill="transparent"
        stroke="none"
        rx={2}
      />
      {/* 選択インジケーター */}
      {selected && (
        <rect
          data-ui="true"
          x={hitX}
          y={hitY}
          width={hitWidth}
          height={hitHeight}
          fill="rgba(37,99,235,0.08)"
          stroke="#2563eb"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          rx={2}
          style={{ pointerEvents: 'none' }}
        />
      )}
      <text
        x={shape.x}
        y={shape.y}
        textAnchor={anchor}
        fontSize={shape.fontSize}
        fontFamily={`"${font}", sans-serif`}
        fontWeight={shape.fontWeight === 'bold' ? 700 : 400}
        fill={shape.color}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={shape.x} dy={i === 0 ? 0 : lineHeight}>
            {linePrefix(shape, i)}{line}
          </tspan>
        ))}
      </text>
    </g>
  );
}
