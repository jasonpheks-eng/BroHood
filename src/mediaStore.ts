const DB_NAME = 'LegacyMediaStore';
const STORE_NAME = 'media';
const objectUrlCache = new Map<string, string>();

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function toPersistentBlob(value: Blob, key: string): Promise<Blob> {
  try {
    const buffer = await value.arrayBuffer();
    const fallbackType = key.includes('vid_') || key.endsWith('.mp4')
      ? 'video/mp4'
      : key.endsWith('.webm')
      ? 'video/webm'
      : key.endsWith('.mov')
      ? 'video/quicktime'
      : 'application/octet-stream';
    return new Blob([buffer], { type: value.type || fallbackType });
  } catch {
    return value;
  }
}

export async function saveMedia(key: string, value: string | Blob): Promise<string> {
  try {
    const payload = value instanceof Blob ? await toPersistentBlob(value, key) : value;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(payload, key);
      req.onsuccess = () => {
        if (payload instanceof Blob) {
          const prevUrl = objectUrlCache.get(`idb://${key}`);
          if (prevUrl) URL.revokeObjectURL(prevUrl);
          objectUrlCache.set(`idb://${key}`, URL.createObjectURL(payload));
        }
        resolve(`idb://${key}`);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to save to IndexedDB', err);
    return typeof value === 'string' ? value : '';
  }
}

export async function saveServerMediaMirror(serverUrl: string, value: Blob): Promise<void> {
  if (!serverUrl || !serverUrl.startsWith('/uploads/')) return;
  try {
    const persistent = await toPersistentBlob(value, serverUrl);
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const mirrorKey = `mirror:${serverUrl}`;
      const req = store.put(persistent, mirrorKey);
      req.onsuccess = () => {
        const prevUrl = objectUrlCache.get(mirrorKey);
        if (prevUrl) URL.revokeObjectURL(prevUrl);
        objectUrlCache.set(mirrorKey, URL.createObjectURL(persistent));
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {
    // Non-blocking local mirror
  }
}

export async function getServerMediaMirror(serverUrl: string): Promise<string> {
  if (!serverUrl || !serverUrl.startsWith('/uploads/')) return '';
  const mirrorKey = `mirror:${serverUrl}`;
  const cached = objectUrlCache.get(mirrorKey);
  if (cached) return cached;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(mirrorKey);
      req.onsuccess = () => {
        const result = req.result;
        if (result instanceof Blob) {
          const blobUrl = URL.createObjectURL(result);
          objectUrlCache.set(mirrorKey, blobUrl);
          resolve(blobUrl);
          return;
        }
        resolve('');
      };
      req.onerror = () => resolve('');
    });
  } catch {
    return '';
  }
}

export function getCachedMediaSync(uri?: string): string {
  if (!uri) return '';
  if (uri.startsWith('idb://')) {
    return objectUrlCache.get(uri) || '';
  }
  if (uri.startsWith('/uploads/')) {
    return objectUrlCache.get(`mirror:${uri}`) || '';
  }
  return uri;
}

export async function getMedia(idbUri: string): Promise<string> {
  if (!idbUri || !idbUri.startsWith('idb://')) return idbUri;
  const cached = objectUrlCache.get(idbUri);
  if (cached) return cached;

  const key = idbUri.replace('idb://', '');
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const result = req.result;
        if (!result) {
          resolve(idbUri);
          return;
        }
        if (result instanceof Blob) {
          const blobUrl = URL.createObjectURL(result);
          objectUrlCache.set(idbUri, blobUrl);
          resolve(blobUrl);
          return;
        }
        resolve(typeof result === 'string' ? result : idbUri);
      };
      req.onerror = () => resolve(idbUri);
    });
  } catch (err) {
    console.error('Failed to read from IndexedDB', err);
    return idbUri;
  }
}
