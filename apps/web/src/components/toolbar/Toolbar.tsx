import { useRef } from 'react';
import { useDrawingStore } from '../../store/drawingStore';
import type { Tool } from '@draw/core';
import styles from './Toolbar.module.css';

interface Props {
  onSvgImport: (content: string, w: number, h: number) => void;
  onImageImport: (dataUri: string, w: number, h: number) => void;
  onOpenIconLibrary: () => void;
  onOpenAssets: () => void;
  onInsertTable: () => void;
  onInsertChart: () => void;
}

const TOOLS: { tool: Tool; icon: string; title: string }[] = [
  { tool: 'select',      icon: 'near_me',                title: '選択 (V)' },
  { tool: 'rect',        icon: 'crop_square',            title: '矩形 (R)' },
  { tool: 'roundedRect', icon: 'rounded_corner',         title: '角丸矩形' },
  { tool: 'ellipse',     icon: 'radio_button_unchecked', title: '楕円 (O)' },
  { tool: 'line',        icon: 'show_chart',             title: '線 (L)（クリックでポイント追加、ダブルクリックで確定）' },
  { tool: 'text',        icon: 'title',                  title: 'テキスト (T)' },
];

export function Toolbar({ onSvgImport, onImageImport, onOpenIconLibrary, onOpenAssets, onInsertTable, onInsertChart }: Props) {
  const { activeTool, setTool, undo, redo } = useDrawingStore();
  const svgInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('読み込み失敗'));
      reader.readAsDataURL(file);
    });
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('画像を解釈できません'));
      img.src = dataUri;
    });
    onImageImport(dataUri, img.naturalWidth, img.naturalHeight);
    e.target.value = '';
  };

  const handleSvgFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    const vb = svg?.getAttribute('viewBox')?.split(/\s+/).map(Number);
    const w = vb ? vb[2] : Number(svg?.getAttribute('width') ?? 100);
    const h = vb ? vb[3] : Number(svg?.getAttribute('height') ?? 100);
    onSvgImport(content, w, h);
    e.target.value = '';
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.group}>
        {TOOLS.map(({ tool, icon, title }) => (
          <button
            key={tool}
            className={`${styles.toolBtn} ${activeTool === tool ? styles.active : ''}`}
            title={title}
            onClick={() => setTool(tool)}
          >
            <span className="material-icons" style={{ fontSize: 20 }}>{icon}</span>
          </button>
        ))}
      </div>
      <div className={styles.group}>
        <button
          className={styles.toolBtn}
          title="SVGファイルをキャンバスに配置"
          onClick={() => svgInputRef.current?.click()}
        >
          <span className="material-icons" style={{ fontSize: 20 }}>add_photo_alternate</span>
        </button>
        <input
          ref={svgInputRef}
          type="file"
          accept=".svg,image/svg+xml"
          style={{ display: 'none' }}
          onChange={handleSvgFileChange}
        />
        <button
          className={styles.toolBtn}
          title="画像ファイル（PNG/JPEG等）をキャンバスに配置"
          onClick={() => imageInputRef.current?.click()}
        >
          <span className="material-icons" style={{ fontSize: 20 }}>image</span>
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          style={{ display: 'none' }}
          onChange={handleImageFileChange}
        />
        <button
          className={styles.toolBtn}
          title="アイコンライブラリ（検索・マイライブラリから配置）"
          onClick={onOpenIconLibrary}
        >
          <span className="material-icons" style={{ fontSize: 20 }}>interests</span>
        </button>
        <button
          className={styles.toolBtn}
          title="アセットライブラリ（パーツの登録・配置。マスター更新で全インスタンス反映）"
          onClick={onOpenAssets}
        >
          <span className="material-icons" style={{ fontSize: 20 }}>dashboard_customize</span>
        </button>
        <button
          className={styles.toolBtn}
          title="表を挿入（ダブルクリックでセル編集。=で数式: SUM/AVG・四則演算）"
          onClick={onInsertTable}
        >
          <span className="material-icons" style={{ fontSize: 20 }}>table_chart</span>
        </button>
        <button
          className={styles.toolBtn}
          title="グラフを挿入（表を選択してから。表のデータを参照して描画）"
          onClick={onInsertChart}
        >
          <span className="material-icons" style={{ fontSize: 20 }}>insert_chart</span>
        </button>
      </div>
      <div className={styles.group}>
        <button className={styles.toolBtn} title="元に戻す (⌘Z)" onClick={undo}>
          <span className="material-icons" style={{ fontSize: 20 }}>undo</span>
        </button>
        <button className={styles.toolBtn} title="やり直す (⌘⇧Z)" onClick={redo}>
          <span className="material-icons" style={{ fontSize: 20 }}>redo</span>
        </button>
      </div>
    </div>
  );
}
