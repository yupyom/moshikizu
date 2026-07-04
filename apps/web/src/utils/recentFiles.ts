import { idbGet, idbSet } from './idbCache';

/**
 * 最近使ったファイル。File System Access API のハンドルは
 * IndexedDB に構造化クローンで保存できる（再オープン時は権限の再確認が必要）。
 */

export interface RecentFile {
  name: string;
  handle: FileSystemFileHandle;
  time: number;
}

const KEY = 'recentFiles';
const MAX = 10;

export async function getRecentFiles(): Promise<RecentFile[]> {
  const v = await idbGet(KEY);
  return Array.isArray(v) ? (v as RecentFile[]) : [];
}

export async function addRecentFile(handle: FileSystemFileHandle, time: number): Promise<void> {
  const list = await getRecentFiles();
  const filtered: RecentFile[] = [];
  for (const r of list) {
    try {
      if (!(await r.handle.isSameEntry(handle))) filtered.push(r);
    } catch {
      // 比較不能なエントリは残す
      filtered.push(r);
    }
  }
  await idbSet(KEY, [{ name: handle.name.normalize('NFC'), handle, time }, ...filtered].slice(0, MAX));
}
