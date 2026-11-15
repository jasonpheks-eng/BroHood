import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  getDocFromServer,
  deleteField,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { Product, Settings, CartItem, CreatorPost } from './types';
import { normalizeHeroMediaList, normalizeMediaUrlInput } from './mediaUrlUtils';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
import { Lock } from 'lucide-react';
import { Navbar } from './components/common/Navbar';
import { HeaderVideoBanner } from './components/common/HeaderVideoBanner';
import { Footer } from './components/common/Footer';
import { CartDrawer } from './components/common/CartDrawer';
import { ProductDetailModal } from './components/pdp/ProductDetailModal';
import { Storefront } from './components/store/Storefront';
import { ShopLayout } from './components/shop/ShopLayout';
import { AdminPanel } from './components/admin/AdminPanel';
import { AdminLoginModal } from './components/admin/AdminLoginModal';
import { updateSupabaseConfig } from './supabase';
import {
  syncProductToSupabase,
  deleteProductFromSupabase,
  syncSettingsToSupabase,
  syncCreatorPostToSupabase,
  deleteCreatorPostFromSupabase,
  syncStudioGalleryToSupabase,
  fetchSupabaseData,
  subscribeToSupabaseRealtime,
} from './supabaseSync';

const DEFAULT_SETTINGS: Settings = {
  brandName: 'BROTHERHOOD',
  logoUrl: '/assets/aistudio/BRO_5917966d.png',
  heroImageUrl: '',
  heroVideoUrl: '/assets/aistudio/brotherhood_hero_loop.mp4',
  heroVideoUrls: ['/assets/aistudio/brotherhood_hero_loop.mp4'],
  featuredImageUrl: '',
  editorialImageUrl: '',
  footerImageUrl: '',
  primaryColor: '#1A1815',
  backgroundColor: '#F8F7F3',
  heroHeadline: 'BrotherHood Collection',
  heroSubtitle: 'Full-Width Campaign Image / Video',
  featuredHeadline: 'Featured Collaboration',
  editorialHeadline: "Creator's Club Vol. 3",
  heroHeight: 'aspect-square md:aspect-[21/9]',
  heroContentAlign: 'items-center justify-center',
  heroOverlayOpacity: 10,
  heroMediaFit: 'cover',
  heroVideoZoom: 1,
  heroVideoPosition: '50% 50%',
  heroImageZoom: 1,
  heroImagePosition: '50% 50%',
  featuredImageZoom: 1,
  featuredImagePosition: '50% 50%',
  editorialImageZoom: 1,
  editorialImagePosition: '50% 50%',
  footerImageZoom: 1,
  footerImagePosition: '50% 50%',
  legacySectionBgColor: '',
  legacySectionTextColor: '',
  aboutUsTitle: 'What Our Merch Means',
  aboutUsText:
    'Every piece in the Brotherhood collection is built to represent unity, resilience, and everyday purpose — heavyweight fabrics engineered to move with you and tell a story beyond apparel.',
  whatsappNumber: '',
};

const HERO_PLAYLIST_CACHE_KEY = 'brotherhood_hero_playlist_v1';

interface CachedHeroPlaylist {
  heroVideoUrls: string[];
  heroVideoUrl: string;
  updatedAt: number;
  explicitDefaultReset?: boolean;
}

function readCachedHeroPlaylist(): CachedHeroPlaylist | null {
  try {
    const raw = localStorage.getItem(HERO_PLAYLIST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedHeroPlaylist;
    if (Array.isArray(parsed?.heroVideoUrls) && parsed.heroVideoUrls.length > 0) {
      return parsed;
    }
  } catch {
    // Ignore storage read errors
  }
  return null;
}

function writeCachedHeroPlaylist(
  urls: string[] | undefined,
  singleUrl: string | undefined,
  explicitDefaultReset = false
) {
  try {
    const cleanUrls = (urls || []).filter((u) => Boolean(u && u.trim()));
    const primary = cleanUrls[0] || (singleUrl && singleUrl.trim()) || DEFAULT_SETTINGS.heroVideoUrl!;
    const finalUrls = cleanUrls.length > 0 ? cleanUrls : [primary];
    const payload: CachedHeroPlaylist = {
      heroVideoUrls: finalUrls,
      heroVideoUrl: finalUrls[0],
      updatedAt: Date.now(),
      explicitDefaultReset,
    };
    localStorage.setItem(HERO_PLAYLIST_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

const SEED_PRODUCTS: Omit<Product, 'id'>[] = [
  {
    name: 'Architectural Heavyweight Fleece Hoodie',
    category: 'HOODIES',
    price: 185,
    imageColor: '#2B2B2B',
    imageUrl: '/src/assets/images/lookbook_hoodie_capsule_1794493275541.jpg',
    galleryImages: [
      '/src/assets/images/fabric_texture_detail_1794493276268.jpg',
      '/src/assets/images/lookbook_hoodie_capsule_1794493275541.jpg',
    ],
    collection: 'legacy',
    variants: [
      { size: 'S', stock: 8 },
      { size: 'M', stock: 14 },
      { size: 'L', stock: 12 },
      { size: 'XL', stock: 5 },
    ],
    totalStock: 39,
  },
  {
    name: 'Tailored Structured Long Sleeve',
    category: 'LONG SLEEVES',
    price: 145,
    imageColor: '#3A3A3C',
    imageUrl: '/src/assets/images/lookbook_tailored_capsule_1794493275320.jpg',
    galleryImages: [
      '/src/assets/images/fabric_texture_detail_1794493276268.jpg',
    ],
    collection: 'legacy',
    variants: [
      { size: 'S', stock: 10 },
      { size: 'M', stock: 18 },
      { size: 'L', stock: 15 },
      { size: 'XL', stock: 8 },
    ],
    totalStock: 51,
  },
  {
    name: 'Tactical Utilitarian Cargo Pant',
    category: 'PANTS',
    price: 195,
    imageColor: '#262626',
    imageUrl: '/src/assets/images/lookbook_hoodie_capsule_1794493275541.jpg',
    collection: 'legacy',
    variants: [
      { size: 'S', stock: 6 },
      { size: 'M', stock: 12 },
      { size: 'L', stock: 9 },
      { size: 'XL', stock: 4 },
    ],
    totalStock: 31,
  },
  {
    name: 'Heritage Low-Profile Structured Cap',
    category: 'CAPS',
    price: 65,
    imageColor: '#171717',
    imageUrl: '/src/assets/images/lookbook_tailored_capsule_1794493275320.jpg',
    collection: 'legacy',
    variants: [
      { size: 'OS', stock: 24 },
    ],
    totalStock: 24,
  },
  {
    name: 'Washed Boxy Heavyweight Tee',
    category: 'SHIRTS',
    price: 85,
    imageColor: '#1C1917',
    imageUrl: '/src/assets/images/fabric_texture_detail_1794493276268.jpg',
    collection: 'legacy',
    variants: [
      { size: 'S', stock: 15 },
      { size: 'M', stock: 22 },
      { size: 'L', stock: 19 },
      { size: 'XL', stock: 11 },
    ],
    totalStock: 67,
  },
];

const SEED_CREATOR_POSTS: Omit<CreatorPost, 'id'>[] = [
  {
    creatorName: 'Marcus Vance',
    handle: '@marcus_vance',
    mediaUrl: '/assets/aistudio/Scene-1_c77479cd.mp4',
    isVideo: true,
    socialLink: 'https://instagram.com/marcus_vance',
    caption: 'Heavyweight fleece hoodie and architectural cargo fit in metropolitan motion.',
    featured: true,
  },
  {
    creatorName: 'Elena Rostova',
    handle: '@elena_rostova',
    mediaUrl: '/src/assets/images/lookbook_hoodie_capsule_1794493275541.jpg',
    isVideo: false,
    socialLink: 'https://instagram.com/elena_rostova',
    caption: 'Over-structured 450GSM capsule hoodie drape.',
    featured: true,
  },
  {
    creatorName: 'Julian Sterling',
    handle: '@julian_sterling',
    mediaUrl: '/src/assets/images/lookbook_tailored_capsule_1794493275320.jpg',
    isVideo: false,
    socialLink: 'https://instagram.com/julian_sterling',
    caption: 'Minimalist poplin long sleeve uniform.',
    featured: true,
  },
  {
    creatorName: 'Darius Chen',
    handle: '@darius_chen',
    mediaUrl: '/src/assets/images/fabric_texture_detail_1794493276268.jpg',
    isVideo: false,
    socialLink: 'https://instagram.com/darius_chen',
    caption: 'Tactical detail macro focus on heavy slub weave.',
    featured: true,
  },
];

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const cachedWhatsapp = localStorage.getItem('brotherhood_whatsapp_number');
      const cachedHero = readCachedHeroPlaylist();
      return {
        ...DEFAULT_SETTINGS,
        ...(cachedWhatsapp ? { whatsappNumber: cachedWhatsapp } : {}),
        ...(cachedHero
          ? {
              heroVideoUrls: cachedHero.heroVideoUrls,
              heroVideoUrl: cachedHero.heroVideoUrl,
            }
          : {}),
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [creatorPosts, setCreatorPosts] = useState<CreatorPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'store' | 'admin' | 'shop'>('store');
  const [initialShopCategory, setInitialShopCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('legacy_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const handledProductDeepLinkRef = React.useRef(false);

  // Open Product Detail modal automatically if ?product=<id> link is visited (e.g. from WhatsApp order)
  useEffect(() => {
    if (handledProductDeepLinkRef.current || products.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const linkedProductId = params.get('product');
    if (!linkedProductId) return;
    const matched = products.find((p) => p.id === linkedProductId);
    if (matched) {
      handledProductDeepLinkRef.current = true;
      setQuickViewProduct(matched);
    }
  }, [products]);

  // Sync Cart to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem('legacy_cart', JSON.stringify(cart));
    } catch (e) {
      console.error('Failed to save cart to localStorage', e);
    }
  }, [cart]);

  // Always start on the main Storefront page; clear any stale view hash on load
  useEffect(() => {
    if (window.location.hash === '#admin' || window.location.hash === '#shop') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setView('store');

    const handleHash = () => {
      const hash = window.location.hash;
      if (hash === '#admin') setView('admin');
      else if (hash === '#shop') setView('shop');
      else setView('store');
    };

    window.addEventListener('hashchange', handleHash);

    // Verify Firestore Connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'settings', 'global'));
      } catch (e) {
        if (e instanceof Error && e.message.includes('the client is offline')) {
          console.error('Please check your Firebase configuration.');
        } else {
          console.error('Firestore connectivity check:', e);
        }
      }
    };
    testConnection();

    let unsubProductsFallback: (() => void) | undefined;
    let unsubCreatorsFallback: (() => void) | undefined;
    let latestFirestoreSettingsTs = 0;
    let latestSupabaseSettingsTs = 0;
    let hasBackfilledSettings = false;
    let hasBackfilledProducts = false;
    let hasBackfilledCreators = false;
    const defaultHero = '/assets/aistudio/brotherhood_hero_loop.mp4';

    const applySupabaseSettings = (incoming: Settings) => {
      const incomingTs = Number(incoming.settingsUpdatedAt) || 0;
      if (incomingTs > 0 && latestFirestoreSettingsTs > incomingTs + 500) {
        return;
      }
      if (incomingTs > latestSupabaseSettingsTs) {
        latestSupabaseSettingsTs = incomingTs;
      }

      const cleanedHeroUrls = Array.isArray(incoming.heroVideoUrls)
        ? normalizeHeroMediaList(incoming.heroVideoUrls)
        : [];
      const cleanedSingleHero = incoming.heroVideoUrl
        ? normalizeMediaUrlInput(incoming.heroVideoUrl)
        : '';

      const finalHeroUrls =
        cleanedHeroUrls.length > 0
          ? cleanedHeroUrls
          : cleanedSingleHero
          ? [cleanedSingleHero]
          : undefined;
      const finalHeroUrl = finalHeroUrls?.[0] || cleanedSingleHero || undefined;

      if (finalHeroUrls && finalHeroUrls.length > 0) {
        const isDefaultOnly = finalHeroUrls.length === 1 && finalHeroUrls[0] === defaultHero;
        writeCachedHeroPlaylist(finalHeroUrls, finalHeroUrl, isDefaultOnly);
      }

      setSettings((prev) => ({
        ...prev,
        ...incoming,
        ...(finalHeroUrls ? { heroVideoUrls: finalHeroUrls } : {}),
        ...(finalHeroUrl !== undefined ? { heroVideoUrl: finalHeroUrl } : {}),
        whatsappNumber:
          incoming.whatsappNumber !== undefined
            ? incoming.whatsappNumber
            : prev.whatsappNumber || '',
      }));

      if (incoming.supabaseUrl || incoming.supabaseAnonKey || incoming.supabaseBucket) {
        updateSupabaseConfig({
          url: incoming.supabaseUrl,
          anonKey: incoming.supabaseAnonKey,
          bucket: incoming.supabaseBucket,
        });
      }
      try {
        if (incoming.whatsappNumber !== undefined) {
          if (incoming.whatsappNumber) {
            localStorage.setItem('brotherhood_whatsapp_number', incoming.whatsappNumber);
          } else {
            localStorage.removeItem('brotherhood_whatsapp_number');
          }
        }
      } catch {}
    };

    // Listen to Settings
    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'global'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as any;
          const firestoreTs = Number(data.settingsUpdatedAt) || 0;
          if (firestoreTs > 0 && latestSupabaseSettingsTs > firestoreTs + 500) {
            return;
          }
          if (firestoreTs > latestFirestoreSettingsTs) {
            latestFirestoreSettingsTs = firestoreTs;
          }

          const heroUrls = Array.isArray(data.heroVideoUrls) ? data.heroVideoUrls : [];
          const cleanedHeroUrls = normalizeHeroMediaList(
            heroUrls.filter(
              (u: unknown): u is string =>
                typeof u === 'string' &&
                u.trim().length > 0 &&
                !u.includes('Scene-1') &&
                !u.includes('Scene-7')
            )
          );
          const rawSingleHero =
            typeof data.heroVideoUrl === 'string' &&
            data.heroVideoUrl.trim().length > 0 &&
            !data.heroVideoUrl.includes('Scene-1') &&
            !data.heroVideoUrl.includes('Scene-7')
              ? normalizeMediaUrlInput(data.heroVideoUrl)
              : '';
          const validSingleHeroUrl = rawSingleHero;

          const merged: Settings = { ...DEFAULT_SETTINGS, ...data };
          if (cleanedHeroUrls.length === 0 && !validSingleHeroUrl) {
            const cachedHero = readCachedHeroPlaylist();
            if (
              cachedHero &&
              !cachedHero.explicitDefaultReset &&
              cachedHero.heroVideoUrls.some((u) => u && u !== defaultHero)
            ) {
              merged.heroVideoUrls = cachedHero.heroVideoUrls;
              merged.heroVideoUrl = cachedHero.heroVideoUrl;
            } else {
              const patch: Record<string, unknown> = {
                heroVideoUrl: defaultHero,
                heroVideoUrls: [defaultHero],
              };
              merged.heroVideoUrl = defaultHero;
              merged.heroVideoUrls = [defaultHero];
              setDoc(doc(db, 'settings', 'global'), patch, { merge: true }).catch(() => {});
            }
          } else if (cleanedHeroUrls.length > 0) {
            const isFirestoreOnlyDefault =
              cleanedHeroUrls.length === 1 && cleanedHeroUrls[0] === defaultHero;
            const cachedHero = readCachedHeroPlaylist();
            const hasRecentLocalCustom =
              Boolean(cachedHero) &&
              !cachedHero!.explicitDefaultReset &&
              Date.now() - cachedHero!.updatedAt < 20000 &&
              cachedHero!.heroVideoUrls.some((u) => u && u !== defaultHero);

            if (isFirestoreOnlyDefault && hasRecentLocalCustom) {
              merged.heroVideoUrls = cachedHero!.heroVideoUrls;
              merged.heroVideoUrl = cachedHero!.heroVideoUrl;
            } else {
              merged.heroVideoUrls = cleanedHeroUrls;
              merged.heroVideoUrl = validSingleHeroUrl || cleanedHeroUrls[0];
              writeCachedHeroPlaylist(
                merged.heroVideoUrls,
                merged.heroVideoUrl,
                isFirestoreOnlyDefault
              );
            }
          } else if (validSingleHeroUrl) {
            merged.heroVideoUrls = [validSingleHeroUrl];
            merged.heroVideoUrl = validSingleHeroUrl;
            writeCachedHeroPlaylist(
              merged.heroVideoUrls,
              merged.heroVideoUrl,
              validSingleHeroUrl === defaultHero
            );
          }
          setSettings(merged);
          if (merged.supabaseUrl || merged.supabaseAnonKey || merged.supabaseBucket) {
            updateSupabaseConfig({
              url: merged.supabaseUrl,
              anonKey: merged.supabaseAnonKey,
              bucket: merged.supabaseBucket,
            });
          }
          try {
            if (merged.whatsappNumber) {
              localStorage.setItem('brotherhood_whatsapp_number', merged.whatsappNumber);
            } else {
              localStorage.removeItem('brotherhood_whatsapp_number');
            }
          } catch {}
        } else {
          setDoc(doc(db, 'settings', 'global'), DEFAULT_SETTINGS).catch((error) =>
            handleFirestoreError(error, OperationType.WRITE, 'settings/global')
          );
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'settings/global');
      }
    );

    // Listen to Products
    const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    const unsubProducts = onSnapshot(
      q,
      (snap) => {
        const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
        const hasSeededBefore = localStorage.getItem('legacy_db_seeded');
        if (loaded.length === 0 && !hasSeededBefore) {
          localStorage.setItem('legacy_db_seeded', 'true');
          // Seed initial products once on initial empty setup
          SEED_PRODUCTS.forEach(async (p) => {
            try {
              const ref = await addDoc(collection(db, 'products'), {
                ...p,
                createdAt: serverTimestamp(),
              });
              await syncProductToSupabase({ ...p, id: ref.id });
            } catch (error) {
              handleFirestoreError(error, OperationType.CREATE, 'products');
            }
          });
        } else {
          setProducts(loaded);
        }
        setLoading(false);
      },
      (err) => {
        console.warn('Ordered products query failed, falling back:', err);
        unsubProductsFallback = onSnapshot(
          collection(db, 'products'),
          (snap) => {
            const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
            setProducts(loaded);
            setLoading(false);
          },
          (fallbackErr) => {
            setLoading(false);
            handleFirestoreError(fallbackErr, OperationType.LIST, 'products');
          }
        );
      }
    );

    // Listen to Creator Posts
    const qCreators = query(collection(db, 'creators_club'), orderBy('createdAt', 'desc'));
    const unsubCreators = onSnapshot(
      qCreators,
      (snap) => {
        const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CreatorPost));
        const hasSeededCreators = localStorage.getItem('creators_db_seeded');
        if (loaded.length === 0 && !hasSeededCreators) {
          localStorage.setItem('creators_db_seeded', 'true');
          SEED_CREATOR_POSTS.forEach(async (cp) => {
            try {
              const ref = await addDoc(collection(db, 'creators_club'), {
                ...cp,
                createdAt: serverTimestamp(),
              });
              await syncCreatorPostToSupabase({ ...cp, id: ref.id });
            } catch (error) {
              handleFirestoreError(error, OperationType.CREATE, 'creators_club');
            }
          });
        } else {
          setCreatorPosts(loaded);
        }
      },
      (err) => {
        console.warn('Creators ordered query failed, falling back:', err);
        unsubCreatorsFallback = onSnapshot(
          collection(db, 'creators_club'),
          (snap) => {
            const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CreatorPost));
            setCreatorPosts(loaded);
          },
          (fallbackErr) => {
            handleFirestoreError(fallbackErr, OperationType.LIST, 'creators_club');
          }
        );
      }
    );

    // Initial Supabase hydration + one-time backfill if a Supabase table is completely empty
    const hydrateFromSupabase = async () => {
      const supa = await fetchSupabaseData();
      if (supa.products && supa.products.length > 0) {
        setProducts((prev) => (prev.length === 0 ? supa.products! : prev));
        setLoading(false);
      } else if (supa.products && supa.products.length === 0 && !hasBackfilledProducts) {
        hasBackfilledProducts = true;
        setProducts((current) => {
          current.forEach((p) => {
            if (p.id) syncProductToSupabase(p).catch(() => {});
          });
          return current;
        });
      }

      if (supa.creatorPosts && supa.creatorPosts.length > 0) {
        setCreatorPosts((prev) => (prev.length === 0 ? supa.creatorPosts! : prev));
      } else if (supa.creatorPosts && supa.creatorPosts.length === 0 && !hasBackfilledCreators) {
        hasBackfilledCreators = true;
        setCreatorPosts((current) => {
          current.forEach((cp) => {
            if (cp.id) syncCreatorPostToSupabase(cp).catch(() => {});
          });
          return current;
        });
      }

      if (supa.settings) {
        applySupabaseSettings(supa.settings);
      } else if (!hasBackfilledSettings) {
        hasBackfilledSettings = true;
        setSettings((current) => {
          syncSettingsToSupabase(current).catch(() => {});
          return current;
        });
      }
    };
    void hydrateFromSupabase();

    // Real-time Supabase synchronization across all connected devices (Broadcast + postgres_changes)
    const unsubSupabaseRealtime = subscribeToSupabaseRealtime({
      onSettings: (supaSettings) => {
        applySupabaseSettings(supaSettings);
      },
      onProducts: (supaProducts) => {
        setProducts(supaProducts);
        setLoading(false);
      },
      onCreators: (supaCreators) => {
        setCreatorPosts(supaCreators);
      },
      onReconnected: () => {
        void hydrateFromSupabase();
      },
    });

    return () => {
      window.removeEventListener('hashchange', handleHash);
      unsubSettings();
      unsubProducts();
      if (unsubProductsFallback) unsubProductsFallback();
      unsubCreators();
      if (unsubCreatorsFallback) unsubCreatorsFallback();
      unsubSupabaseRealtime();
    };
  }, []);

  // Cart Handlers
  const handleAddToCart = (product: Product, size: string = 'M', quantity: number = 1) => {
    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (item) => item.id === product.id && item.selectedSize === size
      );
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx].quantity += quantity;
        return copy;
      }
      return [...prev, { ...product, quantity, selectedSize: size }];
    });
    setIsCartOpen(true);
  };

  const handleUpdateQuantity = (productId: string, delta: number, size?: string) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === productId && (!size || item.selectedSize === size)) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleRemoveItem = (productId: string, size?: string) => {
    setCart((prev) =>
      prev.filter((item) => !(item.id === productId && (!size || item.selectedSize === size)))
    );
  };

  const handleClearCart = () => setCart([]);

  const stripUndefined = <T,>(val: T): T => {
    if (Array.isArray(val)) {
      return val.map((item) => stripUndefined(item)) as unknown as T;
    }
    if (val !== null && typeof val === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (v !== undefined) {
          out[k] = stripUndefined(v);
        }
      }
      return out as T;
    }
    return val;
  };

  // Admin Firestore & Supabase Actions
  const handleSaveProduct = async (product: Product) => {
    const cleanProduct = stripUndefined(product);
    const { id, ...data } = cleanProduct;
    try {
      let savedId = id;
      if (id) {
        const [firestoreRes] = await Promise.allSettled([
          updateDoc(doc(db, 'products', id), data as any),
          syncProductToSupabase({ ...cleanProduct, id }),
        ]);
        if (firestoreRes.status === 'rejected') {
          throw firestoreRes.reason;
        }
      } else {
        const docRef = await addDoc(collection(db, 'products'), {
          ...data,
          createdAt: serverTimestamp(),
        });
        savedId = docRef.id;
        await syncProductToSupabase({ ...cleanProduct, id: savedId });
      }
    } catch (error) {
      handleFirestoreError(error, id ? OperationType.UPDATE : OperationType.CREATE, id ? `products/${id}` : 'products');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    const [firestoreRes] = await Promise.allSettled([
      deleteDoc(doc(db, 'products', productId)),
      deleteProductFromSupabase(productId),
    ]);
    if (firestoreRes.status === 'rejected') {
      handleFirestoreError(firestoreRes.reason, OperationType.DELETE, `products/${productId}`);
    }
  };

  const handleSaveSettings = async (newSettings: Settings) => {
    const { studioGallery: nextGallery, ...settingsWithoutGallery } = stripUndefined(newSettings);
    const cleanSettings = {
      ...(settingsWithoutGallery as Settings),
      settingsUpdatedAt: Date.now(),
    };

    const defaultHero = '/assets/aistudio/brotherhood_hero_loop.mp4';
    const nextHeroUrls = Array.isArray(cleanSettings.heroVideoUrls)
      ? normalizeHeroMediaList(cleanSettings.heroVideoUrls)
      : cleanSettings.heroVideoUrl
      ? normalizeHeroMediaList([cleanSettings.heroVideoUrl])
      : undefined;
    if (nextHeroUrls) {
      cleanSettings.heroVideoUrls = nextHeroUrls;
      cleanSettings.heroVideoUrl = nextHeroUrls[0] || normalizeMediaUrlInput(cleanSettings.heroVideoUrl);
      const explicitDefaultReset =
        nextHeroUrls.length === 1 && nextHeroUrls[0] === defaultHero;
      writeCachedHeroPlaylist(nextHeroUrls, cleanSettings.heroVideoUrl, explicitDefaultReset);
    }

    setSettings((prev) => ({
      ...prev,
      ...cleanSettings,
      ...(nextGallery ? { studioGallery: nextGallery } : {}),
    }));
    if (
      cleanSettings.supabaseUrl !== undefined ||
      cleanSettings.supabaseAnonKey !== undefined ||
      cleanSettings.supabaseBucket !== undefined
    ) {
      updateSupabaseConfig({
        url: cleanSettings.supabaseUrl,
        anonKey: cleanSettings.supabaseAnonKey,
        bucket: cleanSettings.supabaseBucket,
      });
    }
    try {
      if (cleanSettings.whatsappNumber !== undefined) {
        if (cleanSettings.whatsappNumber) {
          localStorage.setItem('brotherhood_whatsapp_number', cleanSettings.whatsappNumber);
        } else {
          localStorage.removeItem('brotherhood_whatsapp_number');
        }
      }
    } catch {}

    const syncTasks: Promise<unknown>[] = [
      setDoc(
        doc(db, 'settings', 'global'),
        {
          ...cleanSettings,
          studioGallery: deleteField(),
        } as any,
        { merge: true }
      ),
      syncSettingsToSupabase(cleanSettings),
    ];
    if (nextGallery) {
      syncTasks.push(syncStudioGalleryToSupabase(nextGallery));
    }
    const [firestoreRes] = await Promise.allSettled(syncTasks);
    if (firestoreRes.status === 'rejected') {
      handleFirestoreError(firestoreRes.reason, OperationType.UPDATE, 'settings/global');
    }
  };

  const handleSaveWhatsappNumber = async (rawNumber: string) => {
    const cleanNumber = rawNumber.trim();
    const updatedAt = Date.now();
    const updatedSettings: Settings = {
      ...settings,
      whatsappNumber: cleanNumber,
      settingsUpdatedAt: updatedAt,
    };
    setSettings((prev) => ({ ...prev, whatsappNumber: cleanNumber, settingsUpdatedAt: updatedAt }));
    try {
      if (cleanNumber) {
        localStorage.setItem('brotherhood_whatsapp_number', cleanNumber);
      } else {
        localStorage.removeItem('brotherhood_whatsapp_number');
      }
    } catch {}
    const [firestoreRes] = await Promise.allSettled([
      setDoc(
        doc(db, 'settings', 'global'),
        { whatsappNumber: cleanNumber, settingsUpdatedAt: updatedAt },
        { merge: true }
      ),
      syncSettingsToSupabase(updatedSettings),
    ]);
    if (firestoreRes.status === 'rejected') {
      handleFirestoreError(firestoreRes.reason, OperationType.UPDATE, 'settings/global');
    }
  };

  const handleSaveApiKeys = async (keys: {
    supabaseUrl: string;
    supabaseAnonKey: string;
    supabaseBucket: string;
  }) => {
    const updatedCfg = updateSupabaseConfig({
      url: keys.supabaseUrl,
      anonKey: keys.supabaseAnonKey,
      bucket: keys.supabaseBucket,
    });
    const updatedAt = Date.now();
    const normalizedPayload = {
      supabaseUrl: updatedCfg.url,
      supabaseAnonKey: updatedCfg.anonKey,
      supabaseBucket: updatedCfg.bucket,
      settingsUpdatedAt: updatedAt,
    };
    setSettings((prev) => ({ ...prev, ...normalizedPayload }));
    const [firestoreRes] = await Promise.allSettled([
      setDoc(doc(db, 'settings', 'global'), normalizedPayload, { merge: true }),
      syncSettingsToSupabase({ ...settings, ...normalizedPayload }),
    ]);
    if (firestoreRes.status === 'rejected') {
      handleFirestoreError(firestoreRes.reason, OperationType.UPDATE, 'settings/global');
    }
  };

  // Creator Post Actions (strictly enforces firestore.rules isValidCreatorPost keys & limits)
  const handleSaveCreatorPost = async (post: CreatorPost) => {
    const { id } = post;
    const rawHandle = (post.handle || '@brotherhood').trim();
    const normalizedHandle = (rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`).slice(0, 120);
    const cleanPayload: Record<string, unknown> = {
      creatorName: String(post.creatorName || '').trim().slice(0, 120),
      handle: normalizedHandle,
      mediaUrl: String(post.mediaUrl || '').trim().slice(0, 200000),
      isVideo: Boolean(post.isVideo),
      featured: post.featured ?? true,
      taggedProductIds: Array.isArray(post.taggedProductIds)
        ? post.taggedProductIds.slice(0, 20)
        : [],
    };
    if (post.avatarUrl) cleanPayload.avatarUrl = String(post.avatarUrl).slice(0, 200000);
    if (post.socialLink !== undefined) cleanPayload.socialLink = String(post.socialLink).slice(0, 500);
    if (post.caption !== undefined) cleanPayload.caption = String(post.caption).slice(0, 1000);

    try {
      let savedId = id;
      if (id) {
        const [firestoreRes] = await Promise.allSettled([
          updateDoc(doc(db, 'creators_club', id), cleanPayload),
          syncCreatorPostToSupabase({
            ...(cleanPayload as unknown as CreatorPost),
            id,
          }),
        ]);
        if (firestoreRes.status === 'rejected') {
          throw firestoreRes.reason;
        }
      } else {
        const docRef = await addDoc(collection(db, 'creators_club'), {
          ...cleanPayload,
          createdAt: serverTimestamp(),
        });
        savedId = docRef.id;
        await syncCreatorPostToSupabase({
          ...(cleanPayload as unknown as CreatorPost),
          id: savedId,
        });
      }
    } catch (error) {
      handleFirestoreError(
        error,
        id ? OperationType.UPDATE : OperationType.CREATE,
        id ? `creators_club/${id}` : 'creators_club'
      );
    }
  };

  const handleDeleteCreatorPost = async (postId: string) => {
    const [firestoreRes] = await Promise.allSettled([
      deleteDoc(doc(db, 'creators_club', postId)),
      deleteCreatorPostFromSupabase(postId),
    ]);
    if (firestoreRes.status === 'rejected') {
      handleFirestoreError(firestoreRes.reason, OperationType.DELETE, `creators_club/${postId}`);
    }
  };

  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center font-sans bg-white text-black gap-4 p-6">
        <div className="w-8 h-8 border-2 border-black border-t-transparent animate-spin rounded-full" />
        <div className="uppercase tracking-[0.25em] text-xs font-black text-zinc-700">
          Loading BrotherHood...
        </div>
      </div>
    );
  }

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div
      style={{
        backgroundColor: settings.backgroundColor || '#F8F7F3',
        color: settings.primaryColor || '#1A1815',
      }}
      className="min-h-screen w-full max-w-full overflow-x-clip flex flex-col font-sans transition-colors duration-300 antialiased"
    >
      {/* Universal Navigation Bar */}
      <Navbar
        settings={settings}
        cartCount={totalCartCount}
        onOpenCart={() => setIsCartOpen(true)}
        activeView={view}
        onChangeView={(nextView) => {
          if (nextView === 'admin') {
            try {
              sessionStorage.removeItem('brotherhood_admin_unlocked');
              localStorage.removeItem('brotherhood_admin_unlocked');
            } catch {}
            setIsAdminLoginOpen(true);
            return;
          }
          if (nextView === 'shop') {
            setInitialShopCategory('all');
          }
          setView(nextView);
        }}
        onScrollToSection={scrollToSection}
        onRequireAdminAuth={() => setIsAdminLoginOpen(true)}
      />

      {/* Persistent Header Video Banner (Displays in any tab, mobile & desktop view) */}
      <HeaderVideoBanner settings={settings} />

      {/* Main View Router */}
      <main className="flex-grow">
        {view === 'admin' ? (
          sessionStorage.getItem('brotherhood_admin_unlocked') === 'true' ||
          localStorage.getItem('brotherhood_admin_unlocked') === 'true' ? (
            <AdminPanel
              products={products}
              settings={settings}
              creatorPosts={creatorPosts}
              onSaveProduct={handleSaveProduct}
              onDeleteProduct={handleDeleteProduct}
              onSaveSettings={handleSaveSettings}
              onSaveWhatsappNumber={handleSaveWhatsappNumber}
              onSaveApiKeys={handleSaveApiKeys}
              onSaveCreatorPost={handleSaveCreatorPost}
              onDeleteCreatorPost={handleDeleteCreatorPost}
              onBackToStore={() => {
                sessionStorage.removeItem('brotherhood_admin_unlocked');
                localStorage.removeItem('brotherhood_admin_unlocked');
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
                setView('store');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          ) : (
            <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
              <div className="w-12 h-12 bg-black text-white flex items-center justify-center mb-4">
                <Lock size={20} />
              </div>
              <h2 className="text-xl font-black uppercase tracking-tight mb-2">Admin Portal Locked</h2>
              <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest mb-6">
                Password authentication required to manage storefront.
              </p>
              <button
                onClick={() => setIsAdminLoginOpen(true)}
                className="bg-black text-white px-8 py-3 text-xs font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-colors"
              >
                Enter Password
              </button>
            </div>
          )
        ) : view === 'shop' ? (
          <ShopLayout
            products={products}
            settings={settings}
            initialCategory={initialShopCategory}
            onAddToCart={(p, s) => handleAddToCart(p, s || 'M', 1)}
            onQuickView={setQuickViewProduct}
            onBackToHome={() => {
              window.history.replaceState(null, '', window.location.pathname + window.location.search);
              setInitialShopCategory('all');
              setView('store');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ) : (
          <Storefront
            settings={settings}
            products={products}
            creatorPosts={creatorPosts}
            onAddToCart={(p, s) => handleAddToCart(p, s || 'M', 1)}
            onQuickView={setQuickViewProduct}
            onNavigateToShop={(category) => {
              setInitialShopCategory(category ? category.toUpperCase() : 'all');
              setView('shop');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSubmitPost={handleSaveCreatorPost}
          />
        )}
      </main>

      {/* Editorial Footer */}
      {view !== 'admin' && (
        <Footer
          settings={settings}
          onNavigate={(target) => {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
            if (target === 'shop') setInitialShopCategory('all');
            setView(target);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      {/* Slide-out Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        settings={settings}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
      />

      {/* Rich Product Detail Modal (PDP) */}
      <ProductDetailModal
        product={quickViewProduct}
        onClose={() => {
          setQuickViewProduct(null);
          const params = new URLSearchParams(window.location.search);
          if (params.has('product')) {
            params.delete('product');
            const nextSearch = params.toString();
            const nextUrl =
              window.location.pathname +
              (nextSearch ? `?${nextSearch}` : '') +
              window.location.hash;
            window.history.replaceState(null, '', nextUrl);
          }
        }}
        onAddToCart={(p, s, q) => handleAddToCart(p, s, q)}
      />

      {/* Admin Authentication Gate Modal */}
      <AdminLoginModal
        isOpen={isAdminLoginOpen}
        onClose={() => setIsAdminLoginOpen(false)}
        onSuccess={() => {
          setIsAdminLoginOpen(false);
          setView('admin');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
}
