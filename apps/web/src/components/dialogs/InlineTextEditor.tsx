import { useEffect, useRef, useState } from 'react';

interface Props {
  initialText: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  font: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

export function InlineTextEditor({
  initialText,
  x, y, width, height,
  fontSize, font,
  onCommit, onCancel,
}: Props) {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onCommit(text);
    }
  };

  return (
    <foreignObject x={x} y={y} width={Math.max(width, 120)} height={Math.max(height, fontSize * 2 + 8)}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => onCommit(text)}
        style={{
          width: '100%',
          height: '100%',
          border: '2px solid #2563eb',
          borderRadius: 4,
          padding: 4,
          resize: 'none',
          fontSize,
          fontFamily: `"${font}", sans-serif`,
          background: 'rgba(255,255,255,0.95)',
          outline: 'none',
          boxSizing: 'border-box',
          textAlign: 'center',
          lineHeight: 1.4,
        }}
      />
    </foreignObject>
  );
}
