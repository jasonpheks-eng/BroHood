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
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { Product, Settings, CartItem, CreatorPost } from './types';

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

const DEFAULT_SETTINGS: Settings = {
  brandName: 'BROTHERHOOD',
  logoUrl: '/assets/aistudio/BRO_5917966d.png',
  heroImageUrl: '',
  heroVideoUrl: '/assets/aistudio/Scene-7_e0813b59.mp4',
  heroVideoUrls: ['/assets/aistudio/Scene-7_e0813b59.mp4'],
  featuredImageUrl: '',
  editorialImageUrl: '',
  footerImageUrl: '',
  primaryColor: '#1A1815',
  backgroundColor: '#F8F7F3',
  heroHeadline: 'The Legacy Capsule',
  heroSubtitle: 'Full-Width Campaign Image / Video',
  featuredHeadline: 'Featured Collaboration',
  editorialHeadline: "Creator's Club Vol. 3",
  heroHeight: 'aspect-square md:aspect-[21/9]',
  heroContentAlign: 'items-center justify-center',
  heroOverlayOpacity: 10,
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
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [products, setProducts] = useState<Product[]>([]);
  const [creatorPosts, setCreatorPosts] = useState<CreatorPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'store' | 'admin' | 'shop'>('store');
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

    // Listen to Settings
    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'global'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as any;
          const heroUrls = data.heroVideoUrls;
          const hasOldScene1 =
            !heroUrls ||
            (Array.isArray(heroUrls) && heroUrls.some((u: string) => u.includes('Scene-1'))) ||
            data.heroVideoUrl?.includes('Scene-1');

          const merged = { ...DEFAULT_SETTINGS, ...data };
          if (hasOldScene1 && (!data.heroVideoUrls || data.heroVideoUrls.length <= 1)) {
            merged.heroVideoUrl = '/assets/aistudio/Scene-7_e0813b59.mp4';
            merged.heroVideoUrls = ['/assets/aistudio/Scene-7_e0813b59.mp4'];
          }
          setSettings(merged);
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
              await addDoc(collection(db, 'products'), {
                ...p,
                createdAt: serverTimestamp(),
              });
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
              await addDoc(collection(db, 'creators_club'), {
                ...cp,
                createdAt: serverTimestamp(),
              });
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

    return () => {
      window.removeEventListener('hashchange', handleHash);
      unsubSettings();
      unsubProducts();
      if (unsubProductsFallback) unsubProductsFallback();
      unsubCreators();
      if (unsubCreatorsFallback) unsubCreatorsFallback();
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

  // Admin Firestore Actions
  const handleSaveProduct = async (product: Product) => {
    const { id, ...data } = product;
    try {
      if (id) {
        await updateDoc(doc(db, 'products', id), data);
      } else {
        await addDoc(collection(db, 'products'), {
          ...data,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, id ? OperationType.UPDATE : OperationType.CREATE, id ? `products/${id}` : 'products');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      await deleteDoc(doc(db, 'products', productId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
    }
  };

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

  const handleSaveSettings = async (newSettings: Settings) => {
    const cleanSettings = stripUndefined(newSettings);
    setSettings((prev) => ({ ...prev, ...cleanSettings }));
    try {
      await setDoc(doc(db, 'settings', 'global'), cleanSettings as any, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
    }
  };

  // Creator Post Actions
  const handleSaveCreatorPost = async (post: CreatorPost) => {
    const { id, ...data } = post;
    try {
      if (id) {
        await updateDoc(doc(db, 'creators_club', id), data);
      } else {
        await addDoc(collection(db, 'creators_club'), {
          ...data,
          createdAt: serverTimestamp(),
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
    try {
      await deleteDoc(doc(db, 'creators_club', postId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `creators_club/${postId}`);
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
      <div className="min-h-screen flex items-center justify-center font-sans uppercase tracking-[0.2em] text-xs text-zinc-400 bg-white">
        Loading The Legacy Platform...
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
      className="min-h-screen flex flex-col font-sans transition-colors duration-300 antialiased"
    >
      {/* Universal Navigation Bar */}
      <Navbar
        settings={settings}
        cartCount={totalCartCount}
        onOpenCart={() => setIsCartOpen(true)}
        activeView={view}
        onChangeView={(nextView) => {
          if (nextView === 'admin') {
            const unlocked =
              sessionStorage.getItem('brotherhood_admin_unlocked') === 'true' ||
              localStorage.getItem('brotherhood_admin_unlocked') === 'true';
            if (!unlocked) {
              setIsAdminLoginOpen(true);
              return;
            }
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
            onAddToCart={(p, s) => handleAddToCart(p, s || 'M', 1)}
            onQuickView={setQuickViewProduct}
            onBackToHome={() => {
              window.history.replaceState(null, '', window.location.pathname + window.location.search);
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
            onNavigateToShop={() => {
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
