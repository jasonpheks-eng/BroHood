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

export async function saveMedia(key: string, value: string | Blob): Promise<string> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => {
        if (value instanceof Blob) {
          const prevUrl = objectUrlCache.get(`idb://${key}`);
          if (prevUrl) URL.revokeObjectURL(prevUrl);
          objectUrlCache.set(`idb://${key}`, URL.createObjectURL(value));
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
