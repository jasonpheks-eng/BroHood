import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { StudioGalleryItem, StudioGalleryState } from '../types';
import { syncStudioGalleryToSupabase } from '../supabaseSync';

export const STUDIO_GALLERY_COLLECTION = 'studio_gallery';
export const STUDIO_GALLERY_DOC_ID = 'config';

export const DEFAULT_STUDIO_GALLERY_STATE: StudioGalleryState = {
  layoutMode: 'all',
  titleLayout: 'tile-corner',
  textAnimation: 'fadeUp',
  kicker: 'Editorial Archive',
  headerTitle: 'Studio Gallery',
  headerDescription:
    'Architectural silhouettes, heavyweight textures, and limited capsule studies captured on frame.',
  items: [
    {
      id: 'tile-1',
      title: 'Heavyweight Fleece',
      subtitle: 'Capsule 01 · Architecture',
      image: '/src/assets/images/lookbook_hoodie_capsule_1794493275541.jpg',
      mediaType: 'image',
      size: '2x2',
      textPosition: 'bottom-left',
    },
    {
      id: 'tile-2',
      title: 'Tailored Drape',
      subtitle: 'Structured Knit',
      image: '/src/assets/images/lookbook_tailored_capsule_1794493275320.jpg',
      mediaType: 'image',
      size: '1x2',
      textPosition: 'bottom-left',
    },
    {
      id: 'tile-3',
      title: '480GSM Cotton',
      subtitle: 'Surface Detail',
      image: '/src/assets/images/fabric_texture_detail_1794493276268.jpg',
      mediaType: 'image',
      size: '1x1',
      textPosition: 'top-left',
    },
    {
      id: 'tile-4',
      title: 'Brotherhood',
      subtitle: 'Crest Monograph',
      image: '/assets/aistudio/BRO_5917966d.png',
      mediaType: 'image',
      size: '1x1',
      textPosition: 'bottom-right',
    },
  ],
};

export function inferMediaType(
  src?: string,
  explicitType?: 'image' | 'video'
): 'image' | 'video' {
  if (explicitType === 'video' || explicitType === 'image') return explicitType;
  if (!src) return 'image';
  if (
    src.startsWith('data:video/') ||
    src.startsWith('idb://studio_video_') ||
    src.startsWith('idb://vid_') ||
    /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(src)
  ) {
    return 'video';
  }
  return 'image';
}

export function serializeStudioGallery(raw: Partial<StudioGalleryState>): StudioGalleryState {
  return {
    layoutMode: raw.layoutMode || DEFAULT_STUDIO_GALLERY_STATE.layoutMode,
    titleLayout: raw.titleLayout || DEFAULT_STUDIO_GALLERY_STATE.titleLayout,
    textAnimation: raw.textAnimation || DEFAULT_STUDIO_GALLERY_STATE.textAnimation,
    kicker: String(raw.kicker ?? DEFAULT_STUDIO_GALLERY_STATE.kicker ?? '').slice(0, 120),
    headerTitle: String(raw.headerTitle ?? DEFAULT_STUDIO_GALLERY_STATE.headerTitle ?? '').slice(0, 120),
    headerDescription: String(
      raw.headerDescription ?? DEFAULT_STUDIO_GALLERY_STATE.headerDescription ?? ''
    ).slice(0, 500),
    items: Array.isArray(raw.items)
      ? raw.items.slice(0, 50).map(
          (item, idx): StudioGalleryItem => {
            const base: StudioGalleryItem = {
              id: String(item.id || `tile-${idx + 1}`).slice(0, 128),
              title: String(item.title ?? '').slice(0, 160),
              subtitle: String(item.subtitle ?? '').slice(0, 160),
              image: String(item.image ?? '').slice(0, 200000),
              mediaType: inferMediaType(item.image, item.mediaType),
              size: item.size || '1x1',
              textPosition: item.textPosition || 'bottom-left',
            };
            if (item.mediaMetadata) {
              const meta: StudioGalleryItem['mediaMetadata'] = {};
              if (item.mediaMetadata.mimeType) meta.mimeType = String(item.mediaMetadata.mimeType);
              if (item.mediaMetadata.fileName) meta.fileName = String(item.mediaMetadata.fileName);
              if (typeof item.mediaMetadata.sizeBytes === 'number') {
                meta.sizeBytes = item.mediaMetadata.sizeBytes;
              }
              if (item.mediaMetadata.source) meta.source = item.mediaMetadata.source;
              if (Object.keys(meta).length > 0) {
                base.mediaMetadata = meta;
              }
            }
            return base;
          }
        )
      : DEFAULT_STUDIO_GALLERY_STATE.items,
  };
}

function reportGalleryFirestoreError(error: unknown, operationType: 'get' | 'write', path: string): never {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface UseStudioGalleryOptions {
  cloudState?: StudioGalleryState;
  onCloudSave?: (nextState: StudioGalleryState) => Promise<void> | void;
  onSave?: (nextState: StudioGalleryState) => Promise<void> | void;
}

function readLocalGalleryState(storageKey: string): StudioGalleryState | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudioGalleryState;
    if (parsed && Array.isArray(parsed.items)) {
      return serializeStudioGallery(parsed);
    }
  } catch {
    // Ignore malformed localStorage entries
  }
  return null;
}

export function useStudioGalleryState(
  storageKey = 'brotherhood_studio_gallery_v1',
  options?: UseStudioGalleryOptions
) {
  const { cloudState, onCloudSave, onSave } = options || {};
  const cloudCallbackRef = useRef(onSave || onCloudSave);

  useEffect(() => {
    cloudCallbackRef.current = onSave || onCloudSave;
  }, [onSave, onCloudSave]);

  const [galleryState, setGalleryState] = useState<StudioGalleryState>(() => {
    if (cloudState && Array.isArray(cloudState.items)) {
      return serializeStudioGallery(cloudState);
    }
    const local = typeof window !== 'undefined' ? readLocalGalleryState(storageKey) : null;
    return local || DEFAULT_STUDIO_GALLERY_STATE;
  });

  // Real-time Firestore synchronization from studio_gallery/config across all clients
  useEffect(() => {
    const galleryDocRef = doc(db, STUDIO_GALLERY_COLLECTION, STUDIO_GALLERY_DOC_ID);
    const unsubscribe = onSnapshot(
      galleryDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<StudioGalleryState>;
          const normalized = serializeStudioGallery(data);
          setGalleryState(normalized);
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(normalized));
          } catch {
            // Ignore storage quota errors
          }
        }
      },
      (error) => {
        console.error('Studio Gallery snapshot listener error:', error);
      }
    );

    return () => unsubscribe();
  }, [storageKey]);

  // Fallback sync if legacy settings.studioGallery updates before studio_gallery/config is created
  useEffect(() => {
    if (cloudState && Array.isArray(cloudState.items)) {
      const merged = serializeStudioGallery(cloudState);
      setGalleryState(merged);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(merged));
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [cloudState, storageKey]);

  const saveGalleryState = useCallback(
    async (nextState: StudioGalleryState) => {
      const serialized = serializeStudioGallery(nextState);
      setGalleryState(serialized);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(serialized));
      } catch (err) {
        console.warn('Could not persist Studio Gallery to localStorage:', err);
      }

      const galleryDocRef = doc(db, STUDIO_GALLERY_COLLECTION, STUDIO_GALLERY_DOC_ID);
      try {
        await setDoc(
          galleryDocRef,
          {
            ...serialized,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (error) {
        reportGalleryFirestoreError(
          error,
          'write',
          `${STUDIO_GALLERY_COLLECTION}/${STUDIO_GALLERY_DOC_ID}`
        );
      }

      await syncStudioGalleryToSupabase(serialized);

      if (cloudCallbackRef.current) {
        await cloudCallbackRef.current(serialized);
      }
    },
    [storageKey]
  );

  return {
    galleryState,
    saveGalleryState,
    onSave: saveGalleryState,
  };
}
