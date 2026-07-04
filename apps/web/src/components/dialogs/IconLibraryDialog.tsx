import { useEffect, useRef, useState } from 'react';
import { idbGet, idbSet } from '../../utils/idbCache';
import styles from './IconLibraryDialog.module.css';

/**
 * SVGアイコンライブラリ。
 * - 検索: Iconify API（オープンソースアイコン集の横断検索）
 * - マイライブラリ: 気に入ったアイコンや自分のSVGを登録（IndexedDBに永続化）
 * - 取得したSVGはキャッシュされ、2回目以降はオフラインでも配置できる
 */

interface Props {
  /** SVGテキストと viewBox の寸法を受け取って配置する */
  onPlace: (svgText: string, viewW: number, viewH: number) => void;
  onClose: () => void;
}

interface MyIcon {
  id: string;
  name: string;
  svg: string;
}

const MY_ICONS_KEY = 'iconlib:my';
const PLACE_COLOR = '#1a1a1a';

function parseViewBox(svg: string): { w: number; h: number } {
  const m = svg.match(/viewBox=["']([\d.\s-]+)["']/);
  if (m) {
    const p = m[1].trim().split(/\s+/).map(Number);
    if (p.length === 4 && p[2] > 0 && p[3] > 0) return { w: p[2], h: p[3] };
  }
  return { w: 24, h: 24 };
}

/** currentColor を具体色に置換して自己完結なSVGにする */
function concretizeColor(svg: string): string {
  return svg.replace(/currentColor/g, PLACE_COLOR);
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

export function IconLibraryDialog({ onPlace, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [myIcons, setMyIcons] = useState<MyIcon[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    idbGet(MY_ICONS_KEY).then((v) => {
      if (Array.isArray(v)) setMyIcons(v as MyIcon[]);
    });
  }, []);

  const persistMyIcons = async (next: MyIcon[]) => {
    setMyIcons(next);
    await idbSet(MY_ICONS_KEY, next);
  };

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setMessage(null);
    try {
      const res = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=60`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const icons = Array.isArray(data.icons) ? (data.icons as string[]) : [];
      setResults(icons);
      if (icons.length === 0) setMessage('見つかりませんでした。英語で試してください（例: server, database, cloud）。');
    } catch {
      setResults([]);
      setMessage('検索できませんでした（オフライン？）。マイライブラリは利用できます。');
    } finally {
      setSearching(false);
    }
  };

  /** Iconify からSVG取得（IndexedDBキャッシュ付き） */
  const fetchIconSvg = async (icon: string): Promise<string> => {
    const key = `icon:${icon}`;
    const cached = await idbGet(key);
    if (typeof cached === 'string') return cached;
    const [prefix, name] = icon.split(':');
    const res = await fetch(`https://api.iconify.design/${prefix}/${name}.svg`);
    if (!res.ok) throw new Error('アイコンを取得できません');
    const svg = await res.text();
    await idbSet(key, svg);
    return svg;
  };

  const placeSvg = (svg: string) => {
    const finalSvg = concretizeColor(svg);
    const { w, h } = parseViewBox(finalSvg);
    onPlace(finalSvg, w, h);
    onClose();
  };

  const placeSearchIcon = async (icon: string) => {
    try {
      placeSvg(await fetchIconSvg(icon));
    } catch {
      alert('アイコンを取得できませんでした。');
    }
  };

  const saveToLibrary = async (icon: string) => {
    try {
      const svg = await fetchIconSvg(icon);
      await persistMyIcons([
        ...myIcons.filter((m) => m.name !== icon),
        { id: crypto.randomUUID(), name: icon, svg },
      ]);
    } catch {
      alert('保存できませんでした。');
    }
  };

  const importSvgFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const svg = await file.text();
      if (!svg.includes('<svg')) throw new Error();
      const name = file.name.replace(/\.svg$/i, '');
      await persistMyIcons([
        ...myIcons.filter((m) => m.name !== name),
        { id: crypto.randomUUID(), name, svg },
      ]);
    } catch {
      alert('SVGファイルとして読み込めませんでした。');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>アイコンライブラリ</h2>

        <div className={styles.searchRow}>
          <input
            className={styles.searchInput}
            value={query}
            placeholder="アイコンを検索（英語。例: server, arrow, cloud…）"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            autoFocus
          />
          <button className={styles.searchBtn} onClick={search} disabled={searching}>
            {searching ? '検索中…' : '検索'}
          </button>
        </div>

        {message && <div className={styles.message}>{message}</div>}

        {results.length > 0 && (
          <>
            <div className={styles.sectionLabel}>検索結果（クリックで配置 / ☆でマイライブラリに保存）</div>
            <div className={styles.grid}>
              {results.map((icon) => (
                <div key={icon} className={styles.cell} title={icon}>
                  <button className={styles.iconBtn} onClick={() => placeSearchIcon(icon)}>
                    <img
                      src={`https://api.iconify.design/${icon.replace(':', '/')}.svg`}
                      width={26}
                      height={26}
                      alt={icon}
                      loading="lazy"
                    />
                  </button>
                  <button
                    className={styles.cornerBtn}
                    title="マイライブラリに保存"
                    onClick={() => saveToLibrary(icon)}
                  >
                    ☆
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className={styles.sectionLabel}>マイライブラリ（クリックで配置）</div>
        {myIcons.length === 0 ? (
          <div className={styles.message}>
            まだ登録がありません。検索結果の ☆ か「SVGファイルを登録」で追加できます。
          </div>
        ) : (
          <div className={styles.grid}>
            {myIcons.map((m) => (
              <div key={m.id} className={styles.cell} title={m.name}>
                <button className={styles.iconBtn} onClick={() => placeSvg(m.svg)}>
                  <img src={svgDataUri(m.svg)} width={26} height={26} alt={m.name} />
                </button>
                <button
                  className={`${styles.cornerBtn} ${styles.removeBtn}`}
                  title="ライブラリから削除"
                  onClick={() => persistMyIcons(myIcons.filter((x) => x.id !== m.id))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.footer}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={styles.smallBtn} onClick={() => fileRef.current?.click()}>
              SVGファイルを登録
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".svg,image/svg+xml"
              style={{ display: 'none' }}
              onChange={importSvgFile}
            />
          </div>
          <span className={styles.credit}>検索: Iconify（オープンソースアイコン集）</span>
          <button className={styles.smallBtn} onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
