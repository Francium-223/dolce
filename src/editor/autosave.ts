// **自动保存与崩溃恢复**（参照 MuseScore 的自动保存）：改过还没存的内容隔几秒存进浏览器的 IndexedDB（桌面版的 WebView 里同样有），
// 下次打开时问要不要恢复。识别会话连同原图一起存（识别项目的打包，`omrproject.ts`），恢复后接着核对、不必重新识别。
//
// 只存一份（最近那份）。存盘、打开新文件之后，内容与盘上一致就删掉。一切读写都包 try/catch：隐私窗口、存储被禁时什么也不做。

const DB = "jpeditor";
const STORE = "drafts";
const KEY = "current";

export interface Draft {
  /** 存的时刻（ms） */
  time: number;
  filePath: string | null;
  docFormat: string;
  text: string;
  /** 识别会话：识别项目的打包字节（`packProject`）；没有为 undefined */
  project?: Uint8Array;
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (st: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function saveDraft(d: Draft): Promise<void> {
  await tx("readwrite", (st) => st.put(d, KEY));
}

export async function loadDraft(): Promise<Draft | null> {
  const d = await tx<Draft>("readonly", (st) => st.get(KEY));
  return d && typeof d.text === "string" ? d : null;
}

export async function clearDraft(): Promise<void> {
  await tx("readwrite", (st) => st.delete(KEY));
}
