import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useServerStore } from '../../store/serverStore';
import type { AppSettings, Theme } from '@draw/core';
import { parseTheme, THEME_VERSION } from '@draw/core';
import { FONT_CHOICES, isKnownFont, ensureFontLink } from '../../utils/fonts';
import { downloadBlob } from '../../utils/download';
import styles from './SettingsDialog.module.css';

interface Props {
  onClose: () => void;
}

export function SettingsDialog({ onClose }: Props) {
  const { settings, saveSettings, themes, addTheme, deleteTheme } = useSettingsStore();
  const [local, setLocal] = useState<AppSettings>({ ...settings });
  const [customFont, setCustomFont] = useState(!isKnownFont(settings.font));
  const themeFileRef = useRef<HTMLInputElement>(null);
  const serverMode = useServerStore((s) => s.mode);
  const [serverThemes, setServerThemes] = useState<{ name: string; updated_by: string }[]>([]);

  // サーバーログイン時は共有テーマ一覧を取得
  useEffect(() => {
    if (serverMode !== 'authenticated') return;
    fetch('/api/themes')
      .then((r) => (r.ok ? r.json() : []))
      .then(setServerThemes)
      .catch(() => {});
  }, [serverMode]);

  const shareTheme = async (t: Theme) => {
    const res = await fetch(`/api/themes/${encodeURIComponent(t.name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    });
    if (res.ok) {
      setServerThemes((prev) => [...prev.filter((x) => x.name !== t.name), { name: t.name, updated_by: '自分' }]);
    } else {
      alert('共有に失敗しました');
    }
  };

  const importServerTheme = async (name: string) => {
    try {
      const res = await fetch(`/api/themes/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error();
      addTheme(parseTheme(await res.json()));
    } catch {
      alert('取込に失敗しました');
    }
  };

  // ---- テーマ ----

  const applyTheme = (t: Theme) => {
    setLocal((prev) => ({
      ...prev,
      colorPalette: t.colorPalette,
      font: t.font,
      strokeWidths: t.strokeWidths,
      ...(t.fontSizes ? { fontSizes: t.fontSizes } : {}),
      ...(t.defaultCornerRadius !== undefined ? { defaultCornerRadius: t.defaultCornerRadius } : {}),
    }));
    setCustomFont(!isKnownFont(t.font));
    ensureFontLink(t.font);
  };

  const saveCurrentAsTheme = () => {
    const name = prompt('テーマ名', '')?.trim();
    if (!name) return;
    if (themes.some((t) => t.name === name) && !confirm(`「${name}」を上書きしますか？`)) return;
    addTheme({
      version: THEME_VERSION,
      name,
      colorPalette: local.colorPalette,
      font: local.font,
      strokeWidths: local.strokeWidths,
      fontSizes: local.fontSizes,
      defaultCornerRadius: local.defaultCornerRadius,
    });
  };

  const exportTheme = (t: Theme) => {
    const blob = new Blob([JSON.stringify(t, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${t.name}.drawtheme.json`);
  };

  const importTheme = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const theme = parseTheme(JSON.parse(await file.text()));
      if (themes.some((t) => t.name === theme.name) && !confirm(`「${theme.name}」を上書きしますか？`)) return;
      addTheme(theme);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'テーマを読み込めませんでした');
    } finally {
      e.target.value = '';
    }
  };

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    saveSettings(local);
    onClose();
  };

  const updatePaletteColor = (i: number, color: string) => {
    const next = [...local.colorPalette];
    next[i] = color;
    set('colorPalette', next);
  };

  const updateStrokeWidth = (i: number, val: string) => {
    const next = [...local.strokeWidths];
    next[i] = Number(val);
    set('strokeWidths', next);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>環境設定</h2>

        <div className={styles.row}>
          <label>グリッドサイズ</label>
          <input type="number" value={local.gridSize} min={5} max={100} step={5}
            onChange={(e) => set('gridSize', Number(e.target.value))} />
          <span>px</span>
        </div>

        <div className={styles.row}>
          <label>デフォルト角丸</label>
          <input type="number" value={local.defaultCornerRadius} min={0} max={100}
            onChange={(e) => set('defaultCornerRadius', Number(e.target.value))} />
          <span>px</span>
        </div>

        <div className={styles.row}>
          <label>フォント</label>
          <select
            value={customFont ? '__custom__' : local.font}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setCustomFont(true);
                return;
              }
              setCustomFont(false);
              set('font', e.target.value);
              ensureFontLink(e.target.value); // プレビュー用に読み込む
            }}
            style={{ width: 190 }}
          >
            {FONT_CHOICES.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.fonts.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </optgroup>
            ))}
            <option value="__custom__">カスタム…</option>
          </select>
        </div>

        {customFont && (
          <div className={styles.row}>
            <label>フォント名</label>
            <input
              type="text"
              value={local.font}
              onChange={(e) => set('font', e.target.value)}
              onBlur={() => ensureFontLink(local.font)}
              style={{ width: 190 }}
            />
            <span style={{ fontSize: 11, color: '#666' }}>Google Fonts のファミリー名</span>
          </div>
        )}

        <div className={styles.row}>
          <label>プレビュー</label>
          <div
            style={{
              fontFamily: `"${local.font}", sans-serif`,
              fontSize: 15,
              padding: '4px 8px',
              border: '1px dashed #d1d5db',
              borderRadius: 4,
              flex: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            概念図と模式図 Diagram 123
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <label>カラーパレット（8色）</label>
          <div className={styles.colorGrid}>
            {local.colorPalette.map((color, i) => (
              <input key={i} type="color" value={color}
                onChange={(e) => updatePaletteColor(i, e.target.value)}
                style={{ width: 32, height: 32 }} />
            ))}
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <label>線幅（3段階）</label>
          <div className={styles.widthRow}>
            {local.strokeWidths.map((w, i) => (
              <input key={i} type="number" value={w} min={1} max={20}
                onChange={(e) => updateStrokeWidth(i, e.target.value)}
                style={{ width: 56 }} />
            ))}
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <label>テーマ（カラーパレット・フォント・線幅のセット）</label>
          {themes.length === 0 && (
            <div className={styles.themeEmpty}>保存されたテーマはありません。「現在の設定をテーマ保存」で作成できます。</div>
          )}
          {themes.map((t) => (
            <div key={t.name} className={styles.themeRow}>
              <span className={styles.themeName} title={`${t.font} / ${t.strokeWidths.join('・')}px`}>{t.name}</span>
              <span className={styles.themeSwatches}>
                {t.colorPalette.slice(0, 8).map((c, i) => (
                  <span key={i} className={styles.themeSwatch} style={{ background: c }} />
                ))}
              </span>
              <button className={styles.smallBtn} onClick={() => applyTheme(t)}>適用</button>
              <button className={styles.smallBtn} onClick={() => exportTheme(t)} title="ファイルに書き出して共有">書出</button>
              {serverMode === 'authenticated' && (
                <button className={styles.smallBtn} onClick={() => shareTheme(t)} title="サーバーにアップロードしてチームで共有">共有</button>
              )}
              <button
                className={`${styles.smallBtn} ${styles.dangerBtn}`}
                onClick={() => { if (confirm(`テーマ「${t.name}」を削除しますか？`)) deleteTheme(t.name); }}
              >
                削除
              </button>
            </div>
          ))}
          <div className={styles.themeActions}>
            <button className={styles.smallBtn} onClick={saveCurrentAsTheme}>現在の設定をテーマ保存</button>
            <button className={styles.smallBtn} onClick={() => themeFileRef.current?.click()}>ファイルからインポート</button>
          </div>
          <input
            ref={themeFileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={importTheme}
          />

          {serverMode === 'authenticated' && serverThemes.length > 0 && (
            <>
              <label style={{ marginTop: 4 }}>サーバーの共有テーマ</label>
              {serverThemes.map((t) => (
                <div key={t.name} className={styles.themeRow}>
                  <span className={styles.themeName}>{t.name}</span>
                  <span style={{ fontSize: 11, color: '#999', flexShrink: 0 }}>{t.updated_by}</span>
                  <button className={styles.smallBtn} onClick={() => importServerTheme(t.name)}>取込</button>
                </div>
              ))}
            </>
          )}
        </div>

        {window.drawDesktop && (
          <>
          <div className={styles.fieldGroup}>
            <label>アップデート確認チャンネル（ヘルプ &gt; 更新を確認）</label>
            <select
              value={local.updateChannel}
              onChange={(e) => set('updateChannel', e.target.value as 'main' | 'dev')}
            >
              <option value="main">main（安定版）</option>
              <option value="dev">dev（プレリリースを含む）</option>
            </select>
          </div>
          <div className={styles.fieldGroup}>
            <label>MCPホスト（エージェント連携・デスクトップ版）</label>
            <div className={styles.row}>
              <label style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={local.mcpHostEnabled}
                  onChange={(e) => set('mcpHostEnabled', e.target.checked)}
                />
                有効にする
              </label>
              <span style={{ marginLeft: 12 }}>ポート</span>
              <input
                type="number"
                value={local.mcpHostPort}
                min={1024}
                max={65535}
                onChange={(e) => set('mcpHostPort', Number(e.target.value))}
              />
            </div>
            <span style={{ fontSize: 11, color: '#666' }}>
              有効化すると http://localhost:{local.mcpHostPort}/mcp で開いているドキュメントを
              エージェントが編集できます（localhost限定）
            </span>
          </div>
          </>
        )}

        <div className={styles.actions}>
          <button className={styles.cancel} onClick={onClose}>キャンセル</button>
          <button className={styles.save} onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
