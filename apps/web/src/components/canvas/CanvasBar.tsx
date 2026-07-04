import { useDrawingStore } from '../../store/drawingStore';
import styles from './CanvasBar.module.css';

/** キャンバス切替タブバー（キャンバス下部）。ダブルクリックで名前変更 */
export function CanvasBar() {
  const store = useDrawingStore();

  const handleRename = (id: string, current: string) => {
    const name = prompt('キャンバス名', current);
    if (name && name.trim()) store.updateCanvas(id, { name: name.trim() });
  };

  const handleDelete = (id: string, name: string) => {
    if (store.canvases.length <= 1) return;
    if (!confirm(`「${name}」を削除しますか？（このキャンバス上の図形も削除されます）`)) return;
    store.deleteCanvas(id);
  };

  return (
    <div className={styles.bar}>
      {store.canvases.map((c, i) => (
        <div
          key={c.id}
          className={`${styles.tab} ${c.id === store.activeCanvasId ? styles.active : ''}`}
          onClick={() => store.setActiveCanvas(c.id)}
          onDoubleClick={() => handleRename(c.id, c.name)}
          title="ダブルクリックで名前変更 / ドラッグで並べ替え"
          draggable
          onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const from = Number(e.dataTransfer.getData('text/plain'));
            if (Number.isInteger(from)) store.moveCanvas(from, i);
          }}
        >
          <span className={styles.name}>{c.isMaster ? 'Ⓜ ' : ''}{c.name}</span>
          {store.canvases.length > 1 && c.id === store.activeCanvasId && (
            <button
              className={styles.close}
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(c.id, c.name);
              }}
              title="キャンバスを削除"
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button className={styles.add} onClick={() => store.addCanvas()} title="キャンバスを追加">
        ＋
      </button>
    </div>
  );
}
