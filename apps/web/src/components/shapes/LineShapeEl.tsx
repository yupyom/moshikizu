import type { LineShape, MarkerType } from '@draw/core';
import { buildPath, curveSegmentControls, lineMidpoint, strokeDashArray, markerSpec } from '@draw/core';
import { ShapeLabel } from './ShapeLabel';
import { useSettingsStore } from '../../store/settingsStore';

interface Props {
  shape: LineShape;
  selected: boolean;
  /** ウェイポイント編集モード（ダブルクリックで進入） */
  editing: boolean;
  /** Shiftキー押下中（点の追加/削除カーソル表示用） */
  shiftDown?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointPointerDown?: (e: React.PointerEvent, index: number) => void;
  /** 線上の右クリック */
  onLineContextMenu?: (e: React.MouseEvent) => void;
  /** ウェイポイント上の右クリック */
  onWaypointContextMenu?: (e: React.MouseEvent, index: number) => void;
  /** 編集モードで線上を Shift+クリック → 点を追加 */
  onSegmentShiftAdd?: (e: React.PointerEvent) => void;
  /** 編集モードで点を Shift+クリック → 点を削除 */
  onWaypointShiftDelete?: (index: number) => void;
  /** 曲線のベジェ制御点のドラッグ開始 */
  onCurveControlPointerDown?: (e: React.PointerEvent, segIndex: number, which: 'c1' | 'c2') => void;
}

// マーカー幾何は @draw/core の markerSpec に共通化されている
// （文字列レンダラ @draw/renderer と同一定義を共有し、表示と書き出しを一致させる）
function markerDef(id: string, type: MarkerType, color: string, size: number, isStart = false) {
  const spec = markerSpec(type, color, size);
  if (!spec) return null;
  return (
    <marker
      key={id}
      id={id}
      markerWidth={spec.markerWidth}
      markerHeight={spec.markerHeight}
      refX={spec.refX}
      refY={spec.refY}
      orient={isStart ? 'auto-start-reverse' : 'auto'}
      markerUnits="strokeWidth"
      overflow="visible"
    >
      <g transform={`scale(${spec.contentScale})`}>
        {spec.elements.map((el, i) => {
          const Tag = el.tag;
          return <Tag key={i} {...el.attrs} />;
        })}
      </g>
    </marker>
  );
}

export function LineShapeEl({
  shape, selected, editing, shiftDown = false, onPointerDown,
  onPointPointerDown, onLineContextMenu, onWaypointContextMenu,
  onSegmentShiftAdd, onWaypointShiftDelete, onCurveControlPointerDown,
}: Props) {
  const font = useSettingsStore((s) => s.settings.font);
  const pathD = buildPath(shape.points, shape.pathStyle, shape.curveControls);
  const sw = shape.strokeWidth;
  const markerSize = shape.markerSize ?? 1;
  const startMarkerId = `marker-start-${shape.id}`;
  const endMarkerId = `marker-end-${shape.id}`;

  const mid = lineMidpoint(shape.points);

  const labelText = shape.label?.text ?? '';
  const labelFontSize = shape.label?.fontSize ?? 14;
  const labelWidth = Math.max(labelText.length * labelFontSize * 0.65, 40) + 16;

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onLineContextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    onLineContextMenu(e);
  };

  return (
    <g>
      <defs>
        {markerDef(startMarkerId, shape.startMarker, shape.strokeColor, markerSize, true)}
        {markerDef(endMarkerId, shape.endMarker, shape.strokeColor, markerSize, false)}
      </defs>
      {/* ヒット領域（太い透明パス） */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(sw + 8, 12)}
        style={{ cursor: editing && shiftDown ? 'copy' : 'move' }}
        onPointerDown={(e) => {
          if (e.button === 2) return; // 右クリックは contextmenu で処理
          if (editing && e.shiftKey && onSegmentShiftAdd) {
            e.stopPropagation();
            onSegmentShiftAdd(e);
            return;
          }
          onPointerDown(e);
        }}
        onContextMenu={handleContextMenu}
      />
      {/* 選択ハイライト */}
      {selected && (
        <path
          data-ui="true"
          d={pathD}
          fill="none"
          stroke="#2563eb"
          strokeWidth={sw + 4}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity={0.3}
          style={{ pointerEvents: 'none' }}
        />
      )}
      {/* 本体パス */}
      <path
        d={pathD}
        fill="none"
        stroke={shape.strokeColor}
        strokeWidth={sw}
        strokeDasharray={strokeDashArray(shape.strokeDash, sw)}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        markerStart={shape.startMarker !== 'none' ? `url(#${startMarkerId})` : undefined}
        markerEnd={shape.endMarker !== 'none' ? `url(#${endMarkerId})` : undefined}
        style={{ pointerEvents: 'none' }}
      />
      {/* ラベル（白背景付き） */}
      {shape.label && shape.label.text && (
        <g>
          <rect
            x={mid.x - labelWidth / 2}
            y={mid.y - labelFontSize - 4}
            width={labelWidth}
            height={labelFontSize * 1.6}
            fill="white"
            stroke="none"
            rx={2}
            style={{ pointerEvents: 'none' }}
          />
          <ShapeLabel
            label={shape.label}
            x={mid.x - labelWidth / 2}
            y={mid.y - labelFontSize - 4}
            width={labelWidth}
            height={labelFontSize * 1.6}
            font={font}
          />
        </g>
      )}
      {/* 選択時（非編集）: 編集可能なことを示す小さなポイント表示 */}
      {selected && !editing && shape.points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={3}
          fill="#fff"
          stroke="#2563eb"
          strokeWidth={1}
          data-ui="true"
          style={{ pointerEvents: 'none' }}
        />
      ))}
      {/* 編集モード（曲線）: ベジェ制御点ハンドル */}
      {editing && shape.pathStyle === 'curve' && shape.points.length >= 2 &&
        curveSegmentControls(shape.points, shape.curveControls).map((seg, i) => {
          const p1 = shape.points[i];
          const p2 = shape.points[i + 1];
          return (
            <g key={`ctrl-${i}`} data-ui="true">
              <line x1={p1.x} y1={p1.y} x2={seg.c1.x} y2={seg.c1.y} stroke="#10b981" strokeWidth={1} strokeDasharray="2 2" style={{ pointerEvents: 'none' }} />
              <line x1={p2.x} y1={p2.y} x2={seg.c2.x} y2={seg.c2.y} stroke="#10b981" strokeWidth={1} strokeDasharray="2 2" style={{ pointerEvents: 'none' }} />
              {(['c1', 'c2'] as const).map((which) => {
                const c = which === 'c1' ? seg.c1 : seg.c2;
                return (
                  <rect
                    key={which}
                    x={c.x - 4}
                    y={c.y - 4}
                    width={8}
                    height={8}
                    transform={`rotate(45 ${c.x} ${c.y})`}
                    fill="#10b981"
                    stroke="#fff"
                    strokeWidth={1.2}
                    style={{ cursor: 'move' }}
                    onPointerDown={(e) => {
                      if (e.button === 2) return;
                      e.stopPropagation();
                      onCurveControlPointerDown?.(e, i, which);
                    }}
                  />
                );
              })}
            </g>
          );
        })}

      {/* 編集モード: ウェイポイントのハンドル（ドラッグ移動・右クリックメニュー） */}
      {editing && shape.points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={5}
          fill="#2563eb"
          stroke="#fff"
          strokeWidth={1.5}
          data-ui="true"
          style={{ cursor: shiftDown ? 'not-allowed' : 'move' }}
          onPointerDown={(e) => {
            if (e.button === 2) return;
            e.stopPropagation();
            if (e.shiftKey && onWaypointShiftDelete) {
              onWaypointShiftDelete(i);
              return;
            }
            onPointPointerDown?.(e, i);
          }}
          onContextMenu={(e) => {
            if (!onWaypointContextMenu) return;
            e.preventDefault();
            e.stopPropagation();
            onWaypointContextMenu(e, i);
          }}
        />
      ))}
    </g>
  );
}
