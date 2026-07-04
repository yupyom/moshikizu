import type { ImageShape, HandlePosition } from '@draw/core';
import { effectiveCrop } from '@draw/core';

interface Props {
  shape: ImageShape;
  selected: boolean;
  /** トリミング編集モード（ダブルクリックで進入） */
  cropping?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  /** クロップ枠ハンドルのドラッグ開始 */
  onCropHandlePointerDown?: (e: React.PointerEvent, handle: HandlePosition) => void;
  /** クロップ窓内ドラッグ（画像パン）の開始 */
  onCropPanPointerDown?: (e: React.PointerEvent) => void;
}

const CROP_HANDLES: { pos: HandlePosition; cursor: string }[] = [
  { pos: 'nw', cursor: 'nwse-resize' },
  { pos: 'n', cursor: 'ns-resize' },
  { pos: 'ne', cursor: 'nesw-resize' },
  { pos: 'w', cursor: 'ew-resize' },
  { pos: 'e', cursor: 'ew-resize' },
  { pos: 'sw', cursor: 'nesw-resize' },
  { pos: 's', cursor: 'ns-resize' },
  { pos: 'se', cursor: 'nwse-resize' },
];

function handleXY(pos: HandlePosition, x: number, y: number, w: number, h: number): [number, number] {
  const cx = pos.includes('w') ? x : pos.includes('e') ? x + w : x + w / 2;
  const cy = pos.includes('n') ? y : pos.includes('s') ? y + h : y + h / 2;
  return [cx, cy];
}

/**
 * ラスター画像。crop があれば nested <svg> の viewBox で
 * 非破壊トリミング表示する（元データは保持される）。
 */
export function ImageShapeEl({
  shape, selected, cropping = false,
  onPointerDown, onCropHandlePointerDown, onCropPanPointerDown,
}: Props) {
  const handleImagePointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    if (cropping && onCropPanPointerDown) {
      e.stopPropagation();
      onCropPanPointerDown(e);
      return;
    }
    onPointerDown(e);
  };

  const image = shape.crop ? (
    <svg
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      viewBox={`${shape.crop.x} ${shape.crop.y} ${shape.crop.width} ${shape.crop.height}`}
      preserveAspectRatio="none"
      style={{ cursor: cropping ? 'move' : 'move' }}
      onPointerDown={handleImagePointerDown}
    >
      <image x={0} y={0} width={shape.originalWidth} height={shape.originalHeight} href={shape.href} preserveAspectRatio="none" />
    </svg>
  ) : (
    <image
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      href={shape.href}
      preserveAspectRatio="none"
      style={{ cursor: 'move' }}
      onPointerDown={handleImagePointerDown}
    />
  );

  // クロップモード: 画像全体のキャンバス上の矩形（ゴースト表示用）
  const crop = effectiveCrop(shape);
  const sx = shape.width / crop.width;
  const sy = shape.height / crop.height;
  const imgX = shape.x - crop.x * sx;
  const imgY = shape.y - crop.y * sy;
  const imgW = shape.originalWidth * sx;
  const imgH = shape.originalHeight * sy;

  return (
    <g>
      {/* ゴースト（トリミング外の全体像） */}
      {cropping && (
        <image
          data-ui="true"
          x={imgX}
          y={imgY}
          width={imgW}
          height={imgH}
          href={shape.href}
          preserveAspectRatio="none"
          opacity={0.3}
          style={{ pointerEvents: 'none' }}
        />
      )}
      {image}
      {/* 通常選択の枠 */}
      {selected && !cropping && (
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
      {/* クロップ枠とハンドル */}
      {cropping && (
        <g data-ui="true">
          <rect
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: 'none' }}
          />
          {CROP_HANDLES.map(({ pos, cursor }) => {
            const [cx, cy] = handleXY(pos, shape.x, shape.y, shape.width, shape.height);
            return (
              <rect
                key={pos}
                x={cx - 5}
                y={cy - 5}
                width={10}
                height={10}
                fill="#fff"
                stroke="#f59e0b"
                strokeWidth={2}
                style={{ cursor }}
                onPointerDown={(e) => {
                  if (e.button === 2) return;
                  e.stopPropagation();
                  onCropHandlePointerDown?.(e, pos);
                }}
              />
            );
          })}
        </g>
      )}
    </g>
  );
}
