import { useDrawingStore } from '../../store/drawingStore';
import { alignShapes, distributeShapes } from '@draw/core';
import styles from './AlignmentBar.module.css';

const ALIGN_BTNS = [
  { dir: 'left' as const,   label: 'align_horizontal_left',   title: '左揃え' },
  { dir: 'center' as const, label: 'align_horizontal_center', title: '左右中央揃え' },
  { dir: 'right' as const,  label: 'align_horizontal_right',  title: '右揃え' },
  { dir: 'top' as const,    label: 'align_vertical_top',      title: '上揃え' },
  { dir: 'middle' as const, label: 'align_vertical_center',   title: '上下中央揃え' },
  { dir: 'bottom' as const, label: 'align_vertical_bottom',   title: '下揃え' },
];

export function AlignmentBar() {
  const store = useDrawingStore();

  const apply = (fn: (shapes: typeof store.shapes, sel: Set<string>) => typeof store.shapes) => {
    store.snapshot();
    store.setShapes(fn(store.shapes, store.selectedIds));
  };

  if (store.selectedIds.size < 2) return null;

  return (
    <div className={styles.bar}>
      {ALIGN_BTNS.map(({ dir, label, title }) => (
        <button
          key={dir}
          className={styles.btn}
          title={title}
          onClick={() => apply((shapes, sel) => alignShapes(shapes, sel, dir))}
        >
          <span className="material-icons" style={{ fontSize: 16 }}>{label}</span>
        </button>
      ))}
      <span className={styles.sep} />
      <button className={styles.btn} title="横方向に均等配置" onClick={() => apply((shapes, sel) => distributeShapes(shapes, sel, 'horizontal'))}><span className="material-icons" style={{ fontSize: 16 }}>horizontal_distribute</span></button>
      <button className={styles.btn} title="縦方向に均等配置" onClick={() => apply((shapes, sel) => distributeShapes(shapes, sel, 'vertical'))}><span className="material-icons" style={{ fontSize: 16 }}>vertical_distribute</span></button>
    </div>
  );
}
