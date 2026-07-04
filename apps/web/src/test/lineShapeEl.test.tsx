import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LineShapeEl } from '../components/shapes/LineShapeEl';
import type { LineShape } from '@draw/core';

const baseLine: LineShape = {
  id: 'l1',
  type: 'line',
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ],
  strokeColor: '#112233',
  strokeWidth: 2,
  startMarker: 'none',
  endMarker: 'arrow',
};

function renderLine(shape: LineShape, editing = false) {
  return render(
    <svg>
      <LineShapeEl
        shape={shape}
        selected={editing}
        editing={editing}
        onPointerDown={() => {}}
      />
    </svg>,
  );
}

/** 本体パス（線色で描かれているもの）を取得 */
function bodyPath(container: HTMLElement) {
  return container.querySelector('path[stroke="#112233"]');
}

describe('LineShapeEl', () => {
  it('デフォルトは直交ルーティングの実線', () => {
    const { container } = renderLine(baseLine);
    const path = bodyPath(container);
    expect(path).not.toBeNull();
    expect(path!.getAttribute('stroke-dasharray')).toBeNull();
    // 直交折れ線は角丸の Q ベジェを含む
    expect(path!.getAttribute('d')).toContain('Q');
  });

  it('strokeDash: dashed で stroke-dasharray が線幅比例で付く', () => {
    const { container } = renderLine({ ...baseLine, strokeDash: 'dashed' });
    expect(bodyPath(container)!.getAttribute('stroke-dasharray')).toBe('8 5');
  });

  it("pathStyle: 'curve' で三次ベジェパスになる", () => {
    const { container } = renderLine({ ...baseLine, pathStyle: 'curve' });
    expect(bodyPath(container)!.getAttribute('d')).toContain('C');
  });

  it('マーカー種類とサイズ倍率が marker 定義に反映される', () => {
    const { container } = renderLine({
      ...baseLine,
      startMarker: 'diamond',
      endMarker: 'triangle',
      markerSize: 2,
    });
    const markers = container.querySelectorAll('marker');
    expect(markers.length).toBe(2);
    // (AW + 2) * size = 5 * 2 = 10
    expect(markers[0].getAttribute('markerWidth')).toBe('10');
    expect(container.querySelectorAll('marker polygon').length).toBe(2);
  });

  it('編集モードでウェイポイントのハンドルが表示される', () => {
    const { container } = renderLine(baseLine, true);
    const handles = container.querySelectorAll('circle[r="5"]');
    expect(handles.length).toBe(3);
  });

  it('非編集時はハンドルを表示しない', () => {
    const { container } = renderLine(baseLine, false);
    expect(container.querySelectorAll('circle[r="5"]').length).toBe(0);
  });
});
