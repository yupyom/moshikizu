import type { AssetInstanceShape, AssetMaster } from '@draw/core';
import { resolveAssetInstance } from '@draw/core';
import { renderShapesFragment } from '@draw/renderer';
import { useSettingsStore } from '../../store/settingsStore';

interface Props {
  shape: AssetInstanceShape;
  assets: AssetMaster[];
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}

/**
 * アセットインスタンス。マスター図形（オーバーライド適用済み）を
 * renderer のフラグメントとして描画し、配置矩形へスケールする。
 * マスターを更新すると全インスタンスの表示が変わる。
 */
export function AssetInstanceEl({ shape, assets, selected, onPointerDown }: Props) {
  const font = useSettingsStore((s) => s.settings.font);
  const resolved = resolveAssetInstance(shape, assets);
  const html = resolved ? renderShapesFragment(resolved.shapes, font) : '';

  return (
    <g>
      {resolved ? (
        <g
          transform={`translate(${shape.x} ${shape.y}) scale(${resolved.sx} ${resolved.sy})`}
          style={{ pointerEvents: 'none' }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <g style={{ pointerEvents: 'none' }}>
          <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height}
            fill="#fffbeb" stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" />
          <text x={shape.x + shape.width / 2} y={shape.y + shape.height / 2}
            textAnchor="middle" dominantBaseline="central" fontSize={12} fill="#92400e">
            アセット未定義
          </text>
        </g>
      )}
      {/* ヒット領域 */}
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
          stroke="#7c3aed"
          strokeWidth={2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
}
