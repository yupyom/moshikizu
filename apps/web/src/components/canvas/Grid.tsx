interface Props {
  width: number;
  height: number;
  gridSize: number;
  zoom: number;
  panX: number;
  panY: number;
}

export function Grid({ width, height, gridSize, zoom, panX, panY }: Props) {
  const dots: React.ReactNode[] = [];

  // 画面座標からキャンバス座標に変換し、表示範囲のドットだけ描画
  const step = gridSize * zoom;
  const offsetX = ((panX % gridSize) + gridSize) % gridSize * zoom;
  const offsetY = ((panY % gridSize) + gridSize) % gridSize * zoom;

  const cols = Math.ceil(width / step) + 1;
  const rows = Math.ceil(height / step) + 1;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = offsetX + col * step;
      const y = offsetY + row * step;
      dots.push(
        <circle
          key={`${row}-${col}`}
          cx={x}
          cy={y}
          r={1}
          fill="#ccc"
          style={{ pointerEvents: 'none' }}
        />,
      );
    }
  }

  return <g data-ui="true">{dots}</g>;
}
