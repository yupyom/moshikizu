import { useState } from 'react';
import type { Shape } from '@draw/core';
import { useDrawingStore } from '../../store/drawingStore';
import styles from './SearchReplaceDialog.module.css';

interface Props {
  onClose: () => void;
}

/** shape が query を含むか（テキスト本文 or ラベル） */
function shapeText(s: Shape): string | null {
  if (s.type === 'text') return s.text;
  return s.label?.text ?? null;
}

/** 検索条件からマッチャーを作る。正規表現が不正なら throw */
function makeMatcher(query: string, replacement: string, useRegex: boolean) {
  if (!useRegex) {
    return {
      test: (t: string) => t.includes(query),
      replace: (t: string) => t.split(query).join(replacement),
    };
  }
  const re = new RegExp(query, 'g'); // 不正ならここで throw
  return {
    test: (t: string) => {
      re.lastIndex = 0;
      return re.test(t);
    },
    // $1 等の後方参照が使える
    replace: (t: string) => t.replace(new RegExp(query, 'g'), replacement),
  };
}

export function SearchReplaceDialog({ onClose }: Props) {
  const store = useDrawingStore();
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [allCanvases, setAllCanvases] = useState(true);
  const [useRegex, setUseRegex] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const targets = (test: (t: string) => boolean) =>
    store.shapes.filter((s) => {
      if (!allCanvases && s.canvasId !== store.activeCanvasId) return false;
      const t = shapeText(s);
      return t !== null && query !== '' && test(t);
    });

  // 検索: マッチした図形を選択（現在のキャンバス上のもの）
  const handleSearch = () => {
    if (!query) return;
    let matcher;
    try {
      matcher = makeMatcher(query, replacement, useRegex);
    } catch {
      setMessage('正規表現が不正です');
      return;
    }
    const matches = targets(matcher.test);
    const onActive = matches.filter((s) => s.canvasId === store.activeCanvasId);
    store.selectIds(onActive.map((s) => s.id));
    setMessage(
      matches.length === 0
        ? '見つかりませんでした'
        : `${matches.length}件見つかりました（このキャンバスの${onActive.length}件を選択）`,
    );
  };

  const handleReplaceAll = () => {
    if (!query) return;
    let matcher;
    try {
      matcher = makeMatcher(query, replacement, useRegex);
    } catch {
      setMessage('正規表現が不正です');
      return;
    }
    const matches = targets(matcher.test);
    if (matches.length === 0) {
      setMessage('見つかりませんでした');
      return;
    }
    store.snapshot();
    for (const s of matches) {
      if (s.type === 'text') {
        store.updateShape(s.id, { text: matcher.replace(s.text) });
      } else if (s.label) {
        store.updateShape(s.id, {
          label: { ...s.label, text: matcher.replace(s.label.text) },
        });
      }
    }
    setMessage(`${matches.length}件の図形のテキストを置換しました`);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>検索と置換</h2>
        <div className={styles.row}>
          <label>検索</label>
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setMessage(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
        </div>
        <div className={styles.row}>
          <label>置換</label>
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleReplaceAll(); }}
          />
        </div>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={allCanvases}
            onChange={(e) => setAllCanvases(e.target.checked)}
          />
          すべてのキャンバスを対象にする
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={useRegex}
            onChange={(e) => { setUseRegex(e.target.checked); setMessage(null); }}
          />
          正規表現を使う（置換で $1 等の後方参照が使えます）
        </label>
        {message && <div className={styles.message}>{message}</div>}
        <div className={styles.actions}>
          <button className={styles.btn} onClick={handleSearch}>検索（選択）</button>
          <button className={`${styles.btn} ${styles.primary}`} onClick={handleReplaceAll}>すべて置換</button>
          <button className={styles.btn} onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
