import styles from './ColorPalette.module.css';

interface Props {
  colors: string[];
  value: string;
  onChange: (color: string) => void;
  label?: string;
  /** 「なし（透明）」スウォッチを表示する */
  allowNone?: boolean;
}

export function ColorPalette({ colors, value, onChange, label, allowNone }: Props) {
  return (
    <div className={styles.wrap}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={styles.palette}>
        {allowNone && (
          <button
            className={`${styles.swatch} ${value === 'none' ? styles.selected : ''}`}
            style={{
              background: 'linear-gradient(to top left, #fff 44%, #dc2626 46%, #dc2626 54%, #fff 56%)',
              borderColor: '#ccc',
            }}
            title="なし（透明）"
            onClick={() => onChange('none')}
          />
        )}
        {colors.map((color) => (
          <button
            key={color}
            className={`${styles.swatch} ${value === color ? styles.selected : ''}`}
            style={{ background: color, borderColor: color === '#ffffff' ? '#ccc' : color }}
            title={color}
            onClick={() => onChange(color)}
          />
        ))}
        <input
          type="color"
          className={styles.customColor}
          value={value === 'none' ? '#ffffff' : value}
          onChange={(e) => onChange(e.target.value)}
          title="カスタムカラー"
        />
      </div>
    </div>
  );
}
