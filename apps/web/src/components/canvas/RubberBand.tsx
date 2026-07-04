interface Props {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function RubberBand({ x, y, width, height }: Props) {
  return (
    <rect
      x={width >= 0 ? x : x + width}
      y={height >= 0 ? y : y + height}
      width={Math.abs(width)}
      height={Math.abs(height)}
      fill="rgba(37,99,235,0.08)"
      stroke="#2563eb"
      strokeWidth={1}
      strokeDasharray="4 2"
      vectorEffect="non-scaling-stroke"
      data-ui="true"
      style={{ pointerEvents: 'none' }}
    />
  );
}
