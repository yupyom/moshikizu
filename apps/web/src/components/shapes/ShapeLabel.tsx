import type { LabelStyle, HAlign, VAlign } from '@draw/core';

interface Props {
  label: LabelStyle;
  x: number;
  y: number;
  width: number;
  height: number;
  font: string;
}

function hAnchor(h: HAlign): 'start' | 'middle' | 'end' {
  if (h === 'left') return 'start';
  if (h === 'right') return 'end';
  return 'middle';
}

function xOffset(h: HAlign, width: number): number {
  if (h === 'left') return 8;
  if (h === 'right') return width - 8;
  return width / 2;
}

function yOffset(v: VAlign, height: number, fontSize: number): number {
  if (v === 'top') return fontSize + 4;
  if (v === 'bottom') return height - 4;
  return height / 2;
}

function dominantBaseline(v: VAlign): 'auto' | 'central' {
  if (v === 'top') return 'auto';
  if (v === 'bottom') return 'auto';
  return 'central';
}

export function ShapeLabel({ label, x, y, width, height, font }: Props) {
  const lines = label.text.split('\n');
  const tx = x + xOffset(label.hAlign, width);
  const ty = y + yOffset(label.vAlign, height, label.fontSize);
  const lineHeight = label.fontSize * 1.4;

  return (
    <text
      x={tx}
      y={ty - ((lines.length - 1) * lineHeight) / 2}
      textAnchor={hAnchor(label.hAlign)}
      dominantBaseline={dominantBaseline(label.vAlign)}
      fontSize={label.fontSize}
      fontFamily={`"${font}", sans-serif`}
      fontWeight={label.fontWeight === 'bold' ? 700 : 400}
      fill={label.color}
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={tx} dy={i === 0 ? 0 : lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
