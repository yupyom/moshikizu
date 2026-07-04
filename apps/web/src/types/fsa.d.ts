// File System Access API のピッカー部分の型定義
// （FileSystemFileHandle 本体は lib.dom にあるが、picker は未収録のため）

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface SaveFilePickerOptions {
  /** ダイアログの記憶単位（アプリ固有IDで前回フォルダを覚える） */
  id?: string;
  /** 初回の開始場所（'documents' 等） */
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
  suggestedName?: string;
  types?: FilePickerAcceptType[];
}

interface OpenFilePickerOptions {
  id?: string;
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
  types?: FilePickerAcceptType[];
  multiple?: boolean;
}

interface Window {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
}

// 権限API（IndexedDBに保存したハンドルの再利用時に必要）
interface FileSystemHandle {
  queryPermission?(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}
