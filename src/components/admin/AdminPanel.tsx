import React, { useState } from 'react';
import {
  Plus,
  Minus,
  Edit2,
  Trash2,
  ArrowLeft,
  Save,
  Upload,
  Video,
  Check,
  Copy,
  AlertTriangle,
  X,
  SlidersHorizontal,
  Image as ImageIcon,
  MessageCircle,
  Link2,
  ClipboardPaste,
  Lock,
} from 'lucide-react';
import {
  Product,
  Settings,
  ProductVariant,
  CreatorPost,
  GalleryLayoutMode,
  GalleryTitleLayout,
  GalleryTextAnimation,
  SocialLinkItem,
} from '../../types';
import { saveMedia } from '../../mediaStore';
import { formatPrice, getDefaultSocialLinks, formatWhatsAppDigits } from '../../utils';
import { ResolvedImage, ResolvedVideo } from '../common/ResolvedMedia';
import { StudioGalleryAdmin } from '../gallery/StudioGalleryAdmin';
import { useStudioGalleryState } from '../../hooks/useStudioGalleryState';
import { Helmet } from '../common/Helmet';

interface AdminPanelProps {
  products: Product[];
  settings: Settings;
  creatorPosts?: CreatorPost[];
  onSaveProduct: (product: Product) => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void>;
  onSaveSettings: (settings: Settings) => Promise<void>;
  onSaveCreatorPost?: (post: CreatorPost) => Promise<void>;
  onDeleteCreatorPost?: (postId: string) => Promise<void>;
  onBackToStore: () => void;
}

const ALL_SIZES: ProductVariant['size'][] = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'OS'];
const STANDARD_CATEGORIES = [
  'SHIRTS',
  'HOODIES',
  'CAPS',
  'LONG SLEEVES',
  'PANTS',
  'SHORTS',
  'JACKETS',
  'ACCESSORIES',
];

export const AdminPanel: React.FC<AdminPanelProps> = ({
  products,
  settings,
  creatorPosts = [],
  onSaveProduct,
  onDeleteProduct,
  onSaveSettings,
  onSaveCreatorPost,
  onDeleteCreatorPost,
  onBackToStore,
}) => {
  const [activeTab, setActiveTab] = useState<'products' | 'gallery' | 'settings' | 'creators'>('products');
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [formProduct, setFormProduct] = useState<Partial<Product>>({});
  const [formSettings, setFormSettings] = useState<Settings>({ ...settings });
  const [savingProduct, setSavingProduct] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const settingsRef = React.useRef(settings);
  React.useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const { galleryState, onSave: saveGalleryState } = useStudioGalleryState('brotherhood_studio_gallery_v1', {
    cloudState: settings.studioGallery,
    onSave: async (nextGallery) => {
      const updatedSettings: Settings = { ...settingsRef.current, studioGallery: nextGallery };
      setFormSettings(updatedSettings);
      await onSaveSettings(updatedSettings);
    },
  });

  // Creators Club Admin State
  const [isEditingCreatorPost, setIsEditingCreatorPost] = useState(false);
  const [formCreatorPost, setFormCreatorPost] = useState<Partial<CreatorPost>>({});
  const [savingCreatorPost, setSavingCreatorPost] = useState(false);
  const [creatorPostToDelete, setCreatorPostToDelete] = useState<CreatorPost | null>(null);

  // In-app Delete Confirmation State (No window.confirm!)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync formSettings when settings prop changes
  React.useEffect(() => {
    setFormSettings({ ...settings });
  }, [settings]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Product Add / Edit
  const handleOpenAddProduct = () => {
    setFormProduct({
      name: '',
      category: 'SHIRTS',
      price: 120,
      imageColor: '#F8F7F3',
      imageUrl: '',
      galleryImages: [],
      collection: 'legacy',
      variants: [
        { size: 'S', stock: 10 },
        { size: 'M', stock: 15 },
        { size: 'L', stock: 12 },
        { size: 'XL', stock: 6 },
      ],
      totalStock: 43,
    });
    setIsEditingProduct(true);
  };

  const handleOpenEditProduct = (p: Product) => {
    setFormProduct({
      ...p,
      galleryImages: p.galleryImages || [],
      variants:
        p.variants && p.variants.length > 0
          ? p.variants
          : [
              { size: 'S', stock: 10 },
              { size: 'M', stock: 15 },
              { size: 'L', stock: 12 },
              { size: 'XL', stock: 6 },
            ],
    });
    setIsEditingProduct(true);
  };

  // Duplicate product to quickly create new entries
  const handleDuplicateProduct = async (p: Product) => {
    const { id, ...data } = p;
    const duplicated: Product = {
      ...data,
      name: `${p.name} (Copy)`,
      totalStock: p.totalStock ?? 20,
    };
    try {
      await onSaveProduct(duplicated);
      showToast(`Duplicated "${p.name}" into catalog`);
    } catch (err) {
      console.error('Failed to duplicate product', err);
      showToast('Failed to duplicate garment.');
    }
  };

  // Execute in-app delete
  const handleConfirmDelete = async () => {
    if (!productToDelete || !productToDelete.id) return;
    setIsDeleting(true);
    try {
      const name = productToDelete.name;
      await onDeleteProduct(productToDelete.id);
      setProductToDelete(null);
      showToast(`Removed "${name}" from catalog`);
    } catch (err) {
      console.error('Failed to delete product', err);
      showToast('Failed to delete garment. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Upload handler with IndexedDB offloading
  const handleFileUpload = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const result = reader.result as string;
        if (result.length > 100 * 1024) {
          const key = `media_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const idbUri = await saveMedia(key, result);
          resolve(idbUri);
        } else {
          resolve(result);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Submit Product Form
  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProduct.name?.trim()) {
      showToast('Please enter a garment name');
      return;
    }
    if (formProduct.price === undefined || formProduct.price < 0) {
      showToast('Please enter a valid price');
      return;
    }
    setSavingProduct(true);

    try {
      const variants = formProduct.variants || [];
      const totalStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

      const productToSave: Product = {
        ...formProduct,
        name: formProduct.name.trim(),
        category: formProduct.category || 'SHIRTS',
        price: Number(formProduct.price) || 0,
        imageColor: formProduct.imageColor || '#F8F7F3',
        collection: (formProduct.collection as any) || 'legacy',
        variants,
        totalStock,
      };

      await onSaveProduct(productToSave);
      setIsEditingProduct(false);
      setFormProduct({});
      showToast(
        productToSave.id
          ? `Updated "${productToSave.name}"`
          : `Added "${productToSave.name}" to catalog`
      );
    } catch (err) {
      console.error('Failed to save product', err);
      showToast('Error saving product. Please try again.');
    } finally {
      setSavingProduct(false);
    }
  };

  // Submit Store Settings
  const handleSubmitSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingSettings(true);
    try {
      const sanitized: any = { ...formSettings };
      for (const key of Object.keys(sanitized)) {
        if (typeof sanitized[key] === 'string' && sanitized[key].startsWith('data:')) {
          const idbKey = `settings_${key}_${Date.now()}`;
          sanitized[key] = await saveMedia(idbKey, sanitized[key]);
        }
      }
      if (sanitized.heroVideoUrls && Array.isArray(sanitized.heroVideoUrls)) {
        const offloadedUrls = await Promise.all(
          sanitized.heroVideoUrls.map(async (url: string, i: number) => {
            if (url && url.startsWith('data:')) {
              return await saveMedia(`hero_vid_${i}_${Date.now()}`, url);
            }
            return url;
          })
        );
        sanitized.heroVideoUrls = offloadedUrls;
      }

      if (sanitized.galleryImageUrls && Array.isArray(sanitized.galleryImageUrls)) {
        const offloadedGallery = await Promise.all(
          sanitized.galleryImageUrls.map(async (url: string, i: number) => {
            if (url && url.startsWith('data:')) {
              return await saveMedia(`gallery_img_${i}_${Date.now()}`, url);
            }
            return url;
          })
        );
        sanitized.galleryImageUrls = offloadedGallery;
      }

      sanitized.studioGallery = galleryState;

      await onSaveSettings(sanitized);
      showToast('Store settings saved successfully');
    } catch (err) {
      console.error('Failed to save settings', err);
      showToast('Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  // Creator Post Admin Handlers
  const handleOpenAddCreatorPost = () => {
    setFormCreatorPost({
      creatorName: '',
      handle: '@',
      mediaUrl: '',
      isVideo: false,
      socialLink: '',
      caption: '',
      taggedProductIds: [],
      featured: true,
    });
    setIsEditingCreatorPost(true);
  };

  const handleOpenEditCreatorPost = (post: CreatorPost) => {
    setFormCreatorPost({ ...post, taggedProductIds: post.taggedProductIds || [] });
    setIsEditingCreatorPost(true);
  };

  const handleSaveCreatorPostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCreatorPost.creatorName || !formCreatorPost.mediaUrl || !onSaveCreatorPost) return;
    setSavingCreatorPost(true);
    try {
      await onSaveCreatorPost(formCreatorPost as CreatorPost);
      setIsEditingCreatorPost(false);
      setFormCreatorPost({});
      showToast('Creator post saved successfully!');
    } catch (err) {
      console.error('Failed to save creator post:', err);
      showToast('Error saving creator post.');
    } finally {
      setSavingCreatorPost(false);
    }
  };

  const handleConfirmDeleteCreatorPost = async () => {
    if (!creatorPostToDelete?.id || !onDeleteCreatorPost) return;
    setIsDeleting(true);
    try {
      await onDeleteCreatorPost(creatorPostToDelete.id);
      setCreatorPostToDelete(null);
      showToast('Creator post deleted.');
    } catch (err) {
      console.error('Failed to delete creator post:', err);
      showToast('Error deleting post.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full bg-[#FAFAFA] text-black min-h-screen py-6 md:py-10 relative overflow-x-hidden">
      <Helmet
        title={`Admin Console | ${settings.brandName || 'BROTHERHOOD'} Portal`}
        description="Secure catalog management, lookbook media, and storefront configuration console."
        noIndex={true}
      />
      {/* In-app Toast Banner */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[150] bg-black text-white px-4 sm:px-5 py-3 text-[11px] sm:text-xs font-black uppercase tracking-[0.18em] shadow-2xl flex items-center gap-3 border border-zinc-700 animate-in slide-in-from-bottom-3 duration-200">
          <Check size={16} className="text-emerald-400 shrink-0" />
          <span className="truncate">{toastMessage}</span>
        </div>
      )}

      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-12">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-6 md:mb-8 pb-4 border-b border-zinc-200">
          <button
            onClick={onBackToStore}
            className="flex items-center gap-2 text-[11px] sm:text-xs font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-black transition-colors py-1"
          >
            <ArrowLeft size={14} /> Exit Admin
          </button>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              Admin · {settings.brandName || 'BROTHERHOOD'}
            </span>
            <button
              onClick={onBackToStore}
              className="flex items-center gap-1.5 px-3 py-1 bg-zinc-100 hover:bg-black hover:text-white text-zinc-700 text-[10px] font-black uppercase tracking-wider transition-colors border border-zinc-200"
              title="Lock Admin Session"
            >
              <Lock size={12} /> Lock Admin
            </button>
          </div>
        </div>

        {/* Navigation Tabs (2x2 clean grid on mobile, underline tabs on desktop) */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-8 mb-8 md:mb-10 sm:border-b sm:border-zinc-200 text-[10px] sm:text-xs font-black uppercase tracking-[0.16em] sm:tracking-[0.2em]">
          <button
            onClick={() => setActiveTab('products')}
            className={`px-3 py-2.5 sm:px-0 sm:py-0 sm:pb-3 transition-colors relative text-center sm:text-left border sm:border-0 ${
              activeTab === 'products'
                ? 'bg-black text-white border-black sm:bg-transparent sm:text-black sm:border-b-2 sm:border-black'
                : 'bg-white text-zinc-500 border-zinc-200 sm:bg-transparent sm:text-zinc-400 hover:text-black'
            }`}
          >
            Products ({products.length})
          </button>
          <button
            onClick={() => setActiveTab('gallery')}
            className={`px-3 py-2.5 sm:px-0 sm:py-0 sm:pb-3 transition-colors relative text-center sm:text-left border sm:border-0 ${
              activeTab === 'gallery'
                ? 'bg-black text-white border-black sm:bg-transparent sm:text-black sm:border-b-2 sm:border-black'
                : 'bg-white text-zinc-500 border-zinc-200 sm:bg-transparent sm:text-zinc-400 hover:text-black'
            }`}
          >
            Studio Gallery ({galleryState.items.length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-2.5 sm:px-0 sm:py-0 sm:pb-3 transition-colors relative text-center sm:text-left border sm:border-0 ${
              activeTab === 'settings'
                ? 'bg-black text-white border-black sm:bg-transparent sm:text-black sm:border-b-2 sm:border-black'
                : 'bg-white text-zinc-500 border-zinc-200 sm:bg-transparent sm:text-zinc-400 hover:text-black'
            }`}
          >
            Settings & Visuals
          </button>
          <button
            onClick={() => setActiveTab('creators')}
            className={`px-3 py-2.5 sm:px-0 sm:py-0 sm:pb-3 transition-colors relative text-center sm:text-left border sm:border-0 ${
              activeTab === 'creators'
                ? 'bg-black text-white border-black sm:bg-transparent sm:text-black sm:border-b-2 sm:border-black'
                : 'bg-white text-zinc-500 border-zinc-200 sm:bg-transparent sm:text-zinc-400 hover:text-black'
            }`}
          >
            Creators Club ({creatorPosts.length})
          </button>
        </div>

        {/* Studio Gallery Admin Tab (kept mounted to preserve unsaved draft edits across tabs) */}
        <div className={activeTab === 'gallery' ? 'block' : 'hidden'}>
          <StudioGalleryAdmin
            state={galleryState}
            onSaveAndApply={saveGalleryState}
            onShowToast={showToast}
          />
        </div>

        {/* Tab 1: Products & Inventory */}
        {activeTab === 'products' && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">Catalog Management</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Add new garments, update pricing, upload multiple perspective angles, and remove items.
                </p>
              </div>
              <button
                onClick={handleOpenAddProduct}
                className="bg-black text-white px-6 py-3 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 shadow-md shrink-0 rounded-none"
              >
                <Plus size={16} /> Add New Garment
              </button>
            </div>

            {/* Empty State */}
            {products.length === 0 ? (
              <div className="bg-white border border-zinc-200 p-12 text-center space-y-4">
                <SlidersHorizontal size={40} className="mx-auto text-zinc-300" />
                <h3 className="text-sm font-black uppercase tracking-widest text-black">
                  No Garments in Catalog
                </h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Your store catalog is currently empty. Click below to add your first product.
                </p>
                <button
                  onClick={handleOpenAddProduct}
                  className="bg-black text-white px-6 py-3 text-xs font-black uppercase tracking-widest hover:bg-zinc-800 transition-colors inline-flex items-center gap-2"
                >
                  <Plus size={14} /> Add Product Now
                </button>
              </div>
            ) : (
              <>
                {/* Mobile Product Card List */}
                <div className="space-y-3 md:hidden">
                  {products.map((p) => {
                    const galleryCount = (p.galleryImages?.length || 0) + (p.imageUrl ? 1 : 0);
                    return (
                      <div key={p.id} className="bg-white border border-zinc-200 p-4 space-y-3 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="w-16 h-20 bg-zinc-100 border border-zinc-200 shrink-0 overflow-hidden">
                            {p.imageUrl ? (
                              <ResolvedImage
                                src={p.imageUrl}
                                alt={p.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div style={{ backgroundColor: p.imageColor }} className="w-full h-full" />
                            )}
                          </div>
                          <div className="min-w-0 flex-grow">
                            <h3 className="text-xs font-black uppercase tracking-wider text-black line-clamp-2">
                              {p.name}
                            </h3>
                            <div className="text-[10px] font-bold uppercase text-zinc-500 mt-1">
                              {p.category} · {p.collection === 'legacy' ? 'Capsule' : 'Featured'}
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-xs font-mono font-bold tabular-nums">
                              <span>{formatPrice(p.price)}</span>
                              <span className="text-zinc-300">·</span>
                              <span className={p.totalStock === 0 ? 'text-rose-600' : 'text-zinc-600'}>
                                {p.totalStock ?? 25} units
                              </span>
                              <span className="text-zinc-300">·</span>
                              <span className="text-[10px] text-zinc-400">
                                {galleryCount} img
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-zinc-100">
                          <button
                            onClick={() => handleDuplicateProduct(p)}
                            className="px-3 py-1.5 border border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-zinc-600 hover:text-black flex items-center gap-1"
                          >
                            <Copy size={13} /> Copy
                          </button>
                          <button
                            onClick={() => handleOpenEditProduct(p)}
                            className="px-3 py-1.5 border border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-zinc-700 hover:bg-black hover:text-white flex items-center gap-1"
                          >
                            <Edit2 size={13} /> Edit
                          </button>
                          <button
                            onClick={() => setProductToDelete(p)}
                            className="px-3 py-1.5 border border-rose-200 text-[10px] font-bold uppercase tracking-wider text-rose-600 hover:bg-rose-50 flex items-center gap-1"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Product Table */}
                <div className="hidden md:block bg-white border border-zinc-200 overflow-x-auto shadow-sm">
                  <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    <tr>
                      <th className="py-3.5 px-4">Garment</th>
                      <th className="py-3.5 px-4">Category</th>
                      <th className="py-3.5 px-4">Line</th>
                      <th className="py-3.5 px-4">Price</th>
                      <th className="py-3.5 px-4">Inventory</th>
                      <th className="py-3.5 px-4">Gallery</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {products.map((p) => {
                      const galleryCount = (p.galleryImages?.length || 0) + (p.imageUrl ? 1 : 0);
                      return (
                        <tr key={p.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="py-3.5 px-4 flex items-center gap-3">
                            <div className="w-12 h-14 bg-zinc-100 border border-zinc-200 shrink-0 overflow-hidden">
                              {p.imageUrl ? (
                                <ResolvedImage
                                  src={p.imageUrl}
                                  alt={p.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div style={{ backgroundColor: p.imageColor }} className="w-full h-full" />
                              )}
                            </div>
                            <div>
                              <span className="font-bold text-black uppercase tracking-wider block">
                                {p.name}
                              </span>
                              <span className="text-[9px] text-zinc-400 font-mono">ID: {p.id?.slice(0, 8)}...</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 uppercase text-zinc-600 font-bold">{p.category}</td>
                          <td className="py-3.5 px-4 uppercase text-zinc-600 font-bold">
                            {p.collection === 'legacy' ? 'The Capsule' : 'Featured'}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold tabular-nums">
                            {formatPrice(p.price)}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`font-mono font-bold tabular-nums ${
                                p.totalStock === 0 ? 'text-rose-600' : 'text-zinc-700'
                              }`}
                            >
                              {p.totalStock ?? 25} units
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-zinc-400 font-mono tabular-nums">
                            {galleryCount} image{galleryCount === 1 ? '' : 's'}
                          </td>
                          <td className="py-3.5 px-4 text-right space-x-1">
                            {/* Duplicate Button */}
                            <button
                              onClick={() => handleDuplicateProduct(p)}
                              className="p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 transition-colors"
                              title="Duplicate Garment"
                              aria-label="Duplicate Garment"
                            >
                              <Copy size={15} />
                            </button>
                            {/* Edit Button */}
                            <button
                              onClick={() => handleOpenEditProduct(p)}
                              className="p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 transition-colors"
                              title="Edit Garment"
                              aria-label="Edit Garment"
                            >
                              <Edit2 size={15} />
                            </button>
                            {/* Delete Button (Triggers in-app modal) */}
                            <button
                              onClick={() => setProductToDelete(p)}
                              className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Delete Garment"
                              aria-label="Delete Garment"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        )}

        {/* Tab 2: Store Settings & Visuals */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSubmitSettings} className="space-y-8 md:space-y-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
              <div>
                <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight">Visual & Store Settings</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Control hero media playlist, campaign visuals, and section color schemes.
                </p>
              </div>
              <button
                type="submit"
                disabled={savingSettings}
                className="w-full sm:w-auto justify-center bg-black text-white px-6 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-colors flex items-center gap-2 shadow-sm shrink-0"
              >
                <Save size={14} /> {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>

            {/* Brand & Section Colors */}
            <div className="bg-white p-4 sm:p-6 border border-zinc-200 space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest border-b border-zinc-100 pb-2">
                Brand & Color Tokens
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    value={formSettings.brandName || ''}
                    onChange={(e) => setFormSettings({ ...formSettings, brandName: e.target.value })}
                    className="w-full border border-zinc-200 p-2.5 text-xs uppercase font-bold focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Logo Image URL / Upload
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="https://... or upload image"
                      value={formSettings.logoUrl || ''}
                      onChange={(e) => setFormSettings({ ...formSettings, logoUrl: e.target.value })}
                      className="flex-1 min-w-0 border border-zinc-200 p-2 text-xs font-mono focus:outline-none focus:border-black"
                    />
                    <label className="bg-black text-white hover:bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors flex items-center justify-center gap-1.5 shrink-0">
                      <Upload size={12} /> Upload Logo
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const res = await handleFileUpload(file);
                            setFormSettings({ ...formSettings, logoUrl: res });
                            showToast('Logo image uploaded');
                          }
                        }}
                      />
                    </label>
                  </div>
                  {formSettings.logoUrl && (
                    <div className="mt-2 p-3 bg-zinc-50 border border-zinc-200 flex items-center justify-between">
                      <div className="h-10 border border-zinc-200 bg-white p-1 flex items-center">
                        <ResolvedImage src={formSettings.logoUrl} alt="Logo preview" className="h-full object-contain" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormSettings({ ...formSettings, logoUrl: '' })}
                        className="text-[10px] text-zinc-400 hover:text-rose-600 font-bold uppercase tracking-widest transition-colors"
                      >
                        Remove Logo
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 pt-4 border-t border-zinc-100">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Primary Text Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formSettings.primaryColor || '#1A1815'}
                      onChange={(e) => setFormSettings({ ...formSettings, primaryColor: e.target.value })}
                      className="w-8 h-8 border border-zinc-200 cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={formSettings.primaryColor || ''}
                      onChange={(e) => setFormSettings({ ...formSettings, primaryColor: e.target.value })}
                      className="flex-1 min-w-0 border border-zinc-200 p-1.5 text-xs font-mono uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Site Background
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formSettings.backgroundColor || '#F8F7F3'}
                      onChange={(e) => setFormSettings({ ...formSettings, backgroundColor: e.target.value })}
                      className="w-8 h-8 border border-zinc-200 cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={formSettings.backgroundColor || ''}
                      onChange={(e) => setFormSettings({ ...formSettings, backgroundColor: e.target.value })}
                      className="flex-1 min-w-0 border border-zinc-200 p-1.5 text-xs font-mono uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Legacy Section Bg
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formSettings.legacySectionBgColor || '#FFFFFF'}
                      onChange={(e) => setFormSettings({ ...formSettings, legacySectionBgColor: e.target.value })}
                      className="w-8 h-8 border border-zinc-200 cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      placeholder="Default"
                      value={formSettings.legacySectionBgColor || ''}
                      onChange={(e) => setFormSettings({ ...formSettings, legacySectionBgColor: e.target.value })}
                      className="flex-1 min-w-0 border border-zinc-200 p-1.5 text-xs font-mono uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Legacy Section Text
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formSettings.legacySectionTextColor || '#000000'}
                      onChange={(e) => setFormSettings({ ...formSettings, legacySectionTextColor: e.target.value })}
                      className="w-8 h-8 border border-zinc-200 cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      placeholder="Default"
                      value={formSettings.legacySectionTextColor || ''}
                      onChange={(e) => setFormSettings({ ...formSettings, legacySectionTextColor: e.target.value })}
                      className="flex-1 min-w-0 border border-zinc-200 p-1.5 text-xs font-mono uppercase"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* WhatsApp Checkout & Social Media Tags */}
            <div className="bg-white p-4 sm:p-6 border border-zinc-200 space-y-6">
              <div className="border-b border-zinc-100 pb-3">
                <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  <MessageCircle size={16} /> WhatsApp Checkout & Social Media Tags
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Set your store WhatsApp number for direct cart checkout, and add (+) or remove (-) social tags with pasted links.
                </p>
              </div>

              {/* WhatsApp Number */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block">
                  WhatsApp Checkout Number (Include Country Code, e.g. +1 555 123 4567)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="tel"
                    placeholder="+1 555 123 4567"
                    value={formSettings.whatsappNumber || ''}
                    onChange={(e) => setFormSettings({ ...formSettings, whatsappNumber: e.target.value })}
                    className="flex-1 min-w-0 border border-zinc-200 p-2.5 text-xs font-mono font-bold focus:outline-none focus:border-black"
                  />
                  {formSettings.whatsappNumber && (
                    <button
                      type="button"
                      onClick={async () => {
                        const digits = formatWhatsAppDigits(formSettings.whatsappNumber);
                        const link = digits ? `https://wa.me/${digits}` : '';
                        if (link && navigator.clipboard?.writeText) {
                          try {
                            await navigator.clipboard.writeText(link);
                            showToast('Copied WhatsApp link');
                          } catch {
                            showToast('Select link to copy');
                          }
                        }
                      }}
                      className="border border-zinc-200 hover:border-black px-3 py-2 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                    >
                      <Copy size={12} /> Copy wa.me
                    </button>
                  )}
                </div>
                {formatWhatsAppDigits(formSettings.whatsappNumber) && (
                  <p className="text-[10px] font-mono text-emerald-700">
                    Active Checkout Target: https://wa.me/{formatWhatsAppDigits(formSettings.whatsappNumber)}
                  </p>
                )}
              </div>

              {/* Social Tags Manager (+ / - and Copy/Paste Links) */}
              <div className="space-y-3 pt-4 border-t border-zinc-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-700 flex items-center gap-1.5">
                      <Link2 size={13} /> Footer Social Tags & Links
                    </label>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Use + to add a social tag, - to remove one, and paste or copy profile URLs.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const current: SocialLinkItem[] =
                        formSettings.socialLinks !== undefined
                          ? formSettings.socialLinks
                          : getDefaultSocialLinks(formSettings.brandName);
                      const next: SocialLinkItem[] = [
                        ...current,
                        {
                          id: `social-${Date.now()}`,
                          platform: 'Instagram',
                          tag: '@',
                          url: '',
                        },
                      ];
                      setFormSettings({ ...formSettings, socialLinks: next });
                    }}
                    className="bg-black text-white hover:bg-zinc-800 px-3.5 py-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shrink-0 transition-colors"
                  >
                    <Plus size={13} /> Add Social Tag
                  </button>
                </div>

                {(() => {
                  const socialList: SocialLinkItem[] =
                    formSettings.socialLinks !== undefined
                      ? formSettings.socialLinks
                      : getDefaultSocialLinks(formSettings.brandName);

                  if (socialList.length === 0) {
                    return (
                      <div className="p-6 bg-zinc-50 border border-dashed border-zinc-200 text-center space-y-2">
                        <p className="text-xs text-zinc-500">
                          No social media tags added. Click "Add Social Tag" (+) to add one.
                        </p>
                      </div>
                    );
                  }

                  const updateSocialRow = (idx: number, patch: Partial<SocialLinkItem>) => {
                    const next = socialList.map((item, i) =>
                      i === idx ? { ...item, ...patch } : item
                    );
                    setFormSettings({ ...formSettings, socialLinks: next });
                  };

                  const removeSocialRow = (idx: number) => {
                    const next = socialList.filter((_, i) => i !== idx);
                    setFormSettings({ ...formSettings, socialLinks: next });
                  };

                  return (
                    <div className="space-y-3">
                      {socialList.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="p-3 sm:p-3.5 bg-zinc-50 border border-zinc-200 space-y-2.5"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                            <div className="sm:col-span-4">
                              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                                Platform
                              </label>
                              <input
                                type="text"
                                list={`social-platforms-${idx}`}
                                value={item.platform}
                                placeholder="Instagram, TikTok, X..."
                                onChange={(e) => updateSocialRow(idx, { platform: e.target.value })}
                                className="w-full border border-zinc-200 bg-white p-2 text-xs font-bold uppercase focus:outline-none focus:border-black"
                              />
                              <datalist id={`social-platforms-${idx}`}>
                                <option value="Instagram" />
                                <option value="TikTok" />
                                <option value="X" />
                                <option value="YouTube" />
                                <option value="Facebook" />
                                <option value="Threads" />
                                <option value="Snapchat" />
                                <option value="WhatsApp" />
                              </datalist>
                            </div>

                            <div className="sm:col-span-3">
                              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                                Tag / Handle
                              </label>
                              <input
                                type="text"
                                value={item.tag}
                                placeholder="@brotherhood"
                                onChange={(e) => updateSocialRow(idx, { tag: e.target.value })}
                                className="w-full border border-zinc-200 bg-white p-2 text-xs font-mono focus:outline-none focus:border-black"
                              />
                            </div>

                            <div className="sm:col-span-5">
                              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                                Profile Link (Paste URL)
                              </label>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={item.url}
                                  placeholder="https://instagram.com/..."
                                  onChange={(e) => updateSocialRow(idx, { url: e.target.value })}
                                  className="flex-1 min-w-0 border border-zinc-200 bg-white p-2 text-xs font-mono focus:outline-none focus:border-black"
                                />
                                <button
                                  type="button"
                                  title="Paste link from clipboard"
                                  aria-label="Paste link"
                                  onClick={async () => {
                                    try {
                                      const text = await navigator.clipboard.readText();
                                      if (text) {
                                        updateSocialRow(idx, { url: text.trim() });
                                        showToast('Pasted link from clipboard');
                                      }
                                    } catch {
                                      showToast('Paste directly into the link box (Ctrl/Cmd+V)');
                                    }
                                  }}
                                  className="border border-zinc-200 bg-white hover:border-black p-2 text-zinc-600 hover:text-black transition-colors shrink-0"
                                >
                                  <ClipboardPaste size={14} />
                                </button>
                                <button
                                  type="button"
                                  title="Copy link"
                                  aria-label="Copy link"
                                  onClick={async () => {
                                    if (!item.url) return;
                                    try {
                                      await navigator.clipboard.writeText(item.url);
                                      showToast('Copied social link');
                                    } catch {
                                      showToast('Unable to copy link');
                                    }
                                  }}
                                  className="border border-zinc-200 bg-white hover:border-black p-2 text-zinc-600 hover:text-black transition-colors shrink-0"
                                >
                                  <Copy size={14} />
                                </button>
                                <button
                                  type="button"
                                  title="Remove social tag (-)"
                                  aria-label="Remove social tag"
                                  onClick={() => removeSocialRow(idx)}
                                  className="border border-rose-200 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white p-2 transition-colors shrink-0"
                                >
                                  <Minus size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Hero Media Playlist */}
            <div className="bg-white p-4 sm:p-6 border border-zinc-200 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-2">
                <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  <Video size={16} /> Hero Video Playlist
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    const current = formSettings.heroVideoUrls || [];
                    setFormSettings({ ...formSettings, heroVideoUrls: [...current, ''] });
                  }}
                  className="text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-black flex items-center gap-1"
                >
                  <Plus size={12} /> Add Video Track
                </button>
              </div>

              <div className="space-y-4">
                {(formSettings.heroVideoUrls || ['/assets/aistudio/Scene-1_c77479cd.mp4']).map((url, i) => (
                  <div key={i} className="p-3 sm:p-3.5 bg-zinc-50 border border-zinc-200 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center justify-between sm:justify-start gap-3">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-zinc-400 tabular-nums">0{i + 1}</span>
                          {/* Image / Media Preview Thumbnail */}
                          <div className="w-14 h-12 bg-black border border-zinc-300 overflow-hidden shrink-0 flex items-center justify-center">
                            {url ? (
                              <ResolvedImage src={url} alt={`Track ${i + 1}`} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[9px] text-zinc-500 font-mono">Empty</span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const next = (formSettings.heroVideoUrls || []).filter((_, idx) => idx !== i);
                            setFormSettings({ ...formSettings, heroVideoUrls: next });
                          }}
                          className="sm:hidden text-zinc-400 hover:text-rose-600 p-2"
                          title="Remove media"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <input
                        type="text"
                        value={url}
                        placeholder="Media URL (e.g. video MP4 or image link)"
                        onChange={(e) => {
                          const next = [...(formSettings.heroVideoUrls || [])];
                          next[i] = e.target.value;
                          setFormSettings({ ...formSettings, heroVideoUrls: next });
                        }}
                        className="flex-1 min-w-0 border border-zinc-200 p-2 text-xs font-mono focus:outline-none focus:border-black bg-white"
                      />

                      <div className="flex items-center gap-2 shrink-0">
                        <label className="flex-1 sm:flex-initial bg-black text-white hover:bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors flex items-center justify-center gap-1.5 shrink-0">
                          <Upload size={12} /> Upload File
                          <input
                            type="file"
                            accept="image/*,video/*,image/jpeg,image/png,image/webp,video/mp4"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const res = await handleFileUpload(file);
                                const next = [...(formSettings.heroVideoUrls || [])];
                                next[i] = res;
                                setFormSettings({ ...formSettings, heroVideoUrls: next });
                                showToast('Hero media uploaded');
                              }
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            const next = (formSettings.heroVideoUrls || []).filter((_, idx) => idx !== i);
                            setFormSettings({ ...formSettings, heroVideoUrls: next });
                          }}
                          className="hidden sm:inline-flex text-zinc-400 hover:text-rose-600 p-2"
                          title="Remove media"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Direct Zoom Slider on this Track Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 pt-2.5 border-t border-zinc-200/80">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-600 shrink-0">
                        Zoom Scale: <span className="font-mono text-black font-bold">{(formSettings.heroVideoZoom || formSettings.heroImageZoom || 1).toFixed(1)}x</span>
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="4"
                        step="0.1"
                        value={formSettings.heroVideoZoom || formSettings.heroImageZoom || 1}
                        onChange={(e) => {
                          const z = Number(e.target.value);
                          setFormSettings({ ...formSettings, heroVideoZoom: z, heroImageZoom: z });
                        }}
                        className="flex-grow accent-black cursor-pointer h-1.5 bg-zinc-200"
                      />
                      <span className="hidden sm:inline text-[9px] font-mono text-zinc-400">1.0x - 4.0x</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Hero Image Fallback */}
              <div className="pt-4 border-t border-zinc-100">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                  Hero Cover / Fallback Image
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="https://... or upload image"
                    value={formSettings.heroImageUrl || ''}
                    onChange={(e) => setFormSettings({ ...formSettings, heroImageUrl: e.target.value })}
                    className="flex-1 min-w-0 border border-zinc-200 p-2 text-xs font-mono focus:outline-none focus:border-black"
                  />
                  <label className="bg-zinc-100 hover:bg-zinc-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors flex items-center justify-center gap-1.5 shrink-0">
                    <Upload size={12} /> Upload Image
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const res = await handleFileUpload(file);
                          setFormSettings({ ...formSettings, heroImageUrl: res });
                          showToast('Hero image uploaded');
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Video Zoom & Position Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-zinc-100">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Overlay Darkness ({formSettings.heroOverlayOpacity ?? 10}%)
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="90"
                    value={formSettings.heroOverlayOpacity ?? 10}
                    onChange={(e) =>
                      setFormSettings({ ...formSettings, heroOverlayOpacity: Number(e.target.value) })
                    }
                    className="w-full accent-black cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Media / Image Zoom ({(formSettings.heroVideoZoom || formSettings.heroImageZoom || 1).toFixed(1)}x)
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="4"
                    step="0.1"
                    value={formSettings.heroVideoZoom || formSettings.heroImageZoom || 1}
                    onChange={(e) => {
                      const z = Number(e.target.value);
                      setFormSettings({ ...formSettings, heroVideoZoom: z, heroImageZoom: z });
                    }}
                    className="w-full accent-black cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Video Position ({formSettings.heroVideoPosition || '50% 50%'})
                  </label>
                  <select
                    value={formSettings.heroVideoPosition || '50% 50%'}
                    onChange={(e) =>
                      setFormSettings({ ...formSettings, heroVideoPosition: e.target.value })
                    }
                    className="w-full border border-zinc-200 p-2 text-xs uppercase font-bold"
                  >
                    <option value="50% 50%">Center (50% 50%)</option>
                    <option value="50% 20%">Top (50% 20%)</option>
                    <option value="50% 80%">Bottom (50% 80%)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Studio Gallery Quick Controls & Editor Link */}
            <div className="bg-[#141414] text-[#f5efe6] p-4 sm:p-6 border border-[#2a2628] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-[#d8a39d]">
                    <ImageIcon size={16} /> Studio Gallery Bento & Animations
                  </h3>
                  <p className="text-xs text-white/60 mt-1">
                    Pick Grid Layout Mode, Title Layout Mode, and Overlapping Text Animations directly here or manage tiles in the Studio Gallery tab.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('gallery')}
                  className="w-full sm:w-auto text-center bg-[#f5efe6] text-[#141414] hover:bg-[#d8a39d] px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] transition-colors shrink-0 rounded-none"
                >
                  Open Tile Editor ({galleryState.items.length})
                </button>
              </div>

              {/* Inline Grid Layout Mode, Title Layout Mode & Overlapping Text Animation Pickers */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-[#1a1a1a] border border-white/10 p-4 space-y-2.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#d8a39d] block">
                    Grid Layout Mode
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: 'all', label: 'All Tiles' },
                        { value: 'compact', label: 'Compact Grid' },
                        { value: 'large', label: 'Featured View' },
                        { value: 'minimal', label: 'Clean Tiles' },
                      ] as { value: GalleryLayoutMode; label: string }[]
                    ).map((mode) => {
                      const active = galleryState.layoutMode === mode.value;
                      return (
                        <button
                          key={mode.value}
                          type="button"
                          onClick={async () => {
                            await saveGalleryState({ ...galleryState, layoutMode: mode.value });
                            showToast(`Grid Layout: ${mode.label}`);
                          }}
                          className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider border transition-colors rounded-none ${
                            active
                              ? 'bg-[#f5efe6] text-[#141414] border-[#f5efe6]'
                              : 'bg-[#141414] text-white/75 border-white/10 hover:border-white/30'
                          }`}
                        >
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-[#1a1a1a] border border-white/10 p-4 space-y-2.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#d8a39d] block">
                    Title Layout Mode
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: 'tile-corner', label: 'Tile Corner' },
                        { value: 'centered', label: 'Centered Hero' },
                        { value: 'top-band', label: 'Top Band' },
                        { value: 'editorial-serif', label: 'Editorial Serif' },
                      ] as { value: GalleryTitleLayout; label: string }[]
                    ).map((mode) => {
                      const active = (galleryState.titleLayout || 'tile-corner') === mode.value;
                      return (
                        <button
                          key={mode.value}
                          type="button"
                          onClick={async () => {
                            await saveGalleryState({ ...galleryState, titleLayout: mode.value });
                            showToast(`Title Layout: ${mode.label}`);
                          }}
                          className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider border transition-colors rounded-none ${
                            active
                              ? 'bg-[#d8a39d] text-[#141414] border-[#d8a39d]'
                              : 'bg-[#141414] text-white/75 border-white/10 hover:border-white/30'
                          }`}
                        >
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-[#1a1a1a] border border-white/10 p-4 space-y-2.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#d8a39d] block">
                    Overlapping Text Animations
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(
                      [
                        { value: 'marquee', label: 'Marquee' },
                        { value: 'pulse', label: 'Pulse' },
                        { value: 'float', label: 'Float' },
                        { value: 'fadeUp', label: 'Rise Up' },
                        { value: 'none', label: 'Static' },
                      ] as { value: GalleryTextAnimation; label: string }[]
                    ).map((anim) => {
                      const active = galleryState.textAnimation === anim.value;
                      return (
                        <button
                          key={anim.value}
                          type="button"
                          onClick={async () => {
                            await saveGalleryState({ ...galleryState, textAnimation: anim.value });
                            showToast(`Text Animation: ${anim.label}`);
                          }}
                          className={`px-2.5 py-2 text-[10px] font-black uppercase tracking-wider border transition-colors rounded-none ${
                            active
                              ? 'bg-[#f5efe6] text-[#141414] border-[#f5efe6]'
                              : 'bg-[#141414] text-white/75 border-white/10 hover:border-white/30'
                          }`}
                        >
                          {anim.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* About Us Section Settings */}
            <div className="bg-white p-4 sm:p-6 border border-zinc-200 space-y-5">
              <div className="border-b border-zinc-100 pb-2">
                <h3 className="text-sm font-black uppercase tracking-widest">
                  About Us Section (What Our Merch Means)
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Customize the heading, brand story, and optional backdrop shown in the storefront About Us section.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                      Section Heading
                    </label>
                    <input
                      type="text"
                      placeholder="What Our Merch Means"
                      value={formSettings.aboutUsTitle || ''}
                      onChange={(e) => setFormSettings({ ...formSettings, aboutUsTitle: e.target.value })}
                      className="w-full border border-zinc-200 p-2.5 text-xs font-bold focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                      Optional Background Image URL
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        placeholder="Image URL or upload (optional)"
                        value={formSettings.editorialImageUrl || ''}
                        onChange={(e) => setFormSettings({ ...formSettings, editorialImageUrl: e.target.value })}
                        className="flex-1 min-w-0 border border-zinc-200 p-2 text-xs focus:outline-none focus:border-black"
                      />
                      <label className="bg-zinc-100 hover:bg-zinc-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest cursor-pointer shrink-0 text-center">
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const res = await handleFileUpload(file);
                              setFormSettings({ ...formSettings, editorialImageUrl: res });
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Our Story / Meaning Copy
                  </label>
                  <textarea
                    rows={5}
                    placeholder="Write what your merch means and stands for..."
                    value={formSettings.aboutUsText || ''}
                    onChange={(e) => setFormSettings({ ...formSettings, aboutUsText: e.target.value })}
                    className="w-full border border-zinc-200 p-2.5 text-xs leading-relaxed focus:outline-none focus:border-black resize-y"
                  />
                </div>
              </div>
            </div>

            {/* Campaign Visuals */}
            <div className="bg-white p-4 sm:p-6 border border-zinc-200 space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest border-b border-zinc-100 pb-2">
                Campaign & Footer Visuals
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Featured Campaign Headline
                  </label>
                  <input
                    type="text"
                    value={formSettings.featuredHeadline || ''}
                    onChange={(e) => setFormSettings({ ...formSettings, featuredHeadline: e.target.value })}
                    className="w-full border border-zinc-200 p-2 text-xs uppercase font-bold"
                  />
                  <div className="mt-2 flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Featured image URL"
                      value={formSettings.featuredImageUrl || ''}
                      onChange={(e) => setFormSettings({ ...formSettings, featuredImageUrl: e.target.value })}
                      className="flex-1 min-w-0 border border-zinc-200 p-2 text-xs"
                    />
                    <label className="bg-zinc-100 hover:bg-zinc-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest cursor-pointer text-center shrink-0">
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const res = await handleFileUpload(file);
                            setFormSettings({ ...formSettings, featuredImageUrl: res });
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Footer Full-Bleed Image
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Footer image URL or upload"
                      value={formSettings.footerImageUrl || ''}
                      onChange={(e) => setFormSettings({ ...formSettings, footerImageUrl: e.target.value })}
                      className="flex-1 min-w-0 border border-zinc-200 p-2 text-xs"
                    />
                    <label className="bg-zinc-100 hover:bg-zinc-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest cursor-pointer text-center shrink-0">
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const res = await handleFileUpload(file);
                            setFormSettings({ ...formSettings, footerImageUrl: res });
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Save Action */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingSettings}
                className="w-full sm:w-auto justify-center bg-black text-white px-7 py-3 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-colors flex items-center gap-2 shadow-sm"
              >
                <Save size={14} /> {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        )}

        {/* Product Add / Edit Modal */}
        {isEditingProduct && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="relative w-full max-w-3xl max-h-[90vh] bg-white border border-zinc-200 shadow-2xl overflow-y-auto p-4 sm:p-6 md:p-8 rounded-none">
              <div className="flex items-center justify-between mb-6 pb-2 border-b border-zinc-200">
                <h3 className="text-lg font-black uppercase tracking-tight">
                  {formProduct.id ? 'Edit Garment Details' : 'Add New Garment to Catalog'}
                </h3>
                <button
                  onClick={() => {
                    setIsEditingProduct(false);
                    setFormProduct({});
                  }}
                  className="p-1.5 text-zinc-400 hover:text-black transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitProduct} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                      Garment Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Heavyweight Boxy Tee"
                      value={formProduct.name || ''}
                      onChange={(e) => setFormProduct({ ...formProduct, name: e.target.value })}
                      className="w-full border border-zinc-200 p-2.5 text-xs font-bold uppercase focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                      Price (MK) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="1"
                      placeholder="e.g. 120"
                      value={formProduct.price ?? ''}
                      onChange={(e) => setFormProduct({ ...formProduct, price: Number(e.target.value) })}
                      className="w-full border border-zinc-200 p-2.5 text-xs font-mono font-bold focus:outline-none focus:border-black"
                    />
                  </div>
                </div>

                {/* Category Selection */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1.5">
                    Category Preset
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {STANDARD_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFormProduct({ ...formProduct, category: cat })}
                        className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest border transition-all ${
                          formProduct.category === cat
                            ? 'bg-black text-white border-black'
                            : 'bg-white text-zinc-600 border-zinc-200 hover:border-black'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Custom Category name..."
                    value={formProduct.category || ''}
                    onChange={(e) => setFormProduct({ ...formProduct, category: e.target.value.toUpperCase() })}
                    className="w-full border border-zinc-200 p-2 text-xs font-bold uppercase focus:outline-none focus:border-black"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                      Collection Line
                    </label>
                    <select
                      value={formProduct.collection || 'legacy'}
                      onChange={(e) => setFormProduct({ ...formProduct, collection: e.target.value as any })}
                      className="w-full border border-zinc-200 p-2.5 text-xs uppercase font-bold focus:outline-none focus:border-black"
                    >
                      <option value="legacy">The Legacy Capsule (Main Page)</option>
                      <option value="featured">Featured Collaboration</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                      Swatch / Fallback Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formProduct.imageColor || '#F8F7F3'}
                        onChange={(e) => setFormProduct({ ...formProduct, imageColor: e.target.value })}
                        className="w-9 h-9 border border-zinc-200 cursor-pointer shrink-0"
                      />
                      <input
                        type="text"
                        value={formProduct.imageColor || '#F8F7F3'}
                        onChange={(e) => setFormProduct({ ...formProduct, imageColor: e.target.value })}
                        className="flex-1 min-w-0 border border-zinc-200 p-2 text-xs font-mono uppercase"
                      />
                    </div>
                  </div>
                </div>

                {/* Primary Image & Multi-Angle Gallery */}
                <div className="space-y-4 pt-4 border-t border-zinc-100">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-700">
                      Product Photos & Gallery Angles
                    </label>
                    <label className="text-[10px] font-black uppercase tracking-widest bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 cursor-pointer flex items-center gap-1.5 transition-colors">
                      <Plus size={12} /> Upload Additional Angle
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const uri = await handleFileUpload(file);
                            if (!formProduct.imageUrl) {
                              setFormProduct({ ...formProduct, imageUrl: uri });
                            } else {
                              const gallery = formProduct.galleryImages || [];
                              setFormProduct({ ...formProduct, galleryImages: [...gallery, uri] });
                            }
                          }
                        }}
                      />
                    </label>
                  </div>

                  {/* Primary Image Slot */}
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                      Primary Front Image (URL or Direct Upload)
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        placeholder="https://... or upload local image"
                        value={formProduct.imageUrl || ''}
                        onChange={(e) => setFormProduct({ ...formProduct, imageUrl: e.target.value })}
                        className="flex-1 min-w-0 border border-zinc-200 p-2 text-xs font-mono focus:outline-none focus:border-black"
                      />
                      <label className="bg-black text-white hover:bg-zinc-800 px-4 py-2 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors flex items-center justify-center gap-1.5 shrink-0">
                        <Upload size={12} /> Upload File
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const uri = await handleFileUpload(file);
                              setFormProduct({ ...formProduct, imageUrl: uri });
                            }
                          }}
                        />
                      </label>
                    </div>

                    {formProduct.imageUrl && (
                      <div className="mt-3 p-3 bg-zinc-50 border border-zinc-200 flex items-center gap-4">
                        <div className="w-14 h-16 bg-white border border-zinc-200 overflow-hidden shrink-0">
                          <ResolvedImage src={formProduct.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                          Primary image attached
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Additional Gallery Thumbnails */}
                  {(formProduct.galleryImages || []).length > 0 && (
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block">
                        Additional Angles ({formProduct.galleryImages?.length})
                      </label>
                      <div className="flex flex-wrap gap-3">
                        {formProduct.galleryImages?.map((img, idx) => (
                          <div key={idx} className="relative w-16 h-20 bg-zinc-100 border border-zinc-200 group">
                            <ResolvedImage src={img} alt="Angle" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => {
                                const next = (formProduct.galleryImages || []).filter((_, i) => i !== idx);
                                setFormProduct({ ...formProduct, galleryImages: next });
                              }}
                              className="absolute top-0 right-0 bg-black text-white p-1 hover:bg-rose-600 transition-colors"
                              title="Remove angle"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Sizing Inventory Matrix */}
                <div className="space-y-3 pt-4 border-t border-zinc-100">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-700">
                      Size Inventory Tracking
                    </label>
                    <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
                      Total Units:{' '}
                      {(formProduct.variants || []).reduce((acc, v) => acc + (Number(v.stock) || 0), 0)}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                    {ALL_SIZES.map((size) => {
                      const v = (formProduct.variants || []).find((item) => item.size === size);
                      const currentStock = v ? v.stock : 0;
                      return (
                        <div key={size} className="border border-zinc-200 p-2 text-center bg-zinc-50">
                          <span className="text-[10px] font-black uppercase text-zinc-500 block mb-1">
                            {size}
                          </span>
                          <input
                            type="number"
                            min="0"
                            value={currentStock}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              const existingVariants = [...(formProduct.variants || [])];
                              const foundIdx = existingVariants.findIndex((it) => it.size === size);
                              if (foundIdx >= 0) {
                                existingVariants[foundIdx].stock = val;
                              } else {
                                existingVariants.push({ size, stock: val });
                              }
                              setFormProduct({ ...formProduct, variants: existingVariants });
                            }}
                            className="w-full text-center font-mono font-bold text-xs p-1 border border-zinc-200 bg-white focus:outline-none focus:border-black"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-6 border-t border-zinc-200">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingProduct(false);
                      setFormProduct({});
                    }}
                    className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-black"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingProduct}
                    className="bg-black text-white px-7 py-2.5 text-xs font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-colors flex items-center gap-2 shadow-md"
                  >
                    {savingProduct ? 'Saving...' : formProduct.id ? 'Save Changes' : 'Add Garment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Tab 3: Creators Club Management */}
        {activeTab === 'creators' && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">Creators Club & Model Archive</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Manage model photos, video clips, social handles (@handle), and tagged garments featured in the Creators Club gallery.
                </p>
              </div>
              <button
                onClick={handleOpenAddCreatorPost}
                className="bg-black text-white px-6 py-3 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 shadow-md shrink-0 rounded-none"
              >
                <Plus size={16} /> Add Creator Fit
              </button>
            </div>

            {/* Creators Table / Grid */}
            {creatorPosts.length === 0 ? (
              <div className="bg-white border border-zinc-200 p-12 text-center space-y-4">
                <ImageIcon size={40} className="mx-auto text-zinc-300" />
                <h3 className="text-sm font-black uppercase tracking-widest text-black">
                  No Creator Posts Archived
                </h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Click below to add model or community member fits to the Creators Club section.
                </p>
                <button
                  onClick={handleOpenAddCreatorPost}
                  className="bg-black text-white px-6 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-colors"
                >
                  Add Creator Fit
                </button>
              </div>
            ) : (
              <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-4 -mx-4 px-4 pb-3 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
                {creatorPosts.map((post) => (
                  <div
                    key={post.id}
                    className="w-[75vw] max-w-[300px] shrink-0 snap-start sm:w-auto sm:max-w-none bg-white border border-zinc-200 p-4 flex flex-col justify-between shadow-sm"
                  >
                    <div className="space-y-3">
                      <div className="relative aspect-[3/4] bg-zinc-900 border border-zinc-200 overflow-hidden">
                        {post.isVideo || post.mediaUrl.endsWith('.mp4') ? (
                          <ResolvedVideo src={post.mediaUrl} muted loop playsInline autoPlay className="w-full h-full object-cover" />
                        ) : (
                          <ResolvedImage src={post.mediaUrl} alt={post.creatorName} className="w-full h-full object-cover" />
                        )}
                        <div className="absolute top-2 left-2 bg-black/80 text-white text-[9px] font-mono px-2 py-0.5">
                          {post.handle}
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold uppercase tracking-wider text-black">{post.creatorName}</h4>
                        <p className="text-xs text-zinc-500 line-clamp-2 mt-0.5 font-light">"{post.caption || 'No caption'}"</p>
                      </div>

                      {post.taggedProductIds && post.taggedProductIds.length > 0 && (
                        <div className="text-[10px] font-bold uppercase text-zinc-400">
                          Tagged: {post.taggedProductIds.length} Garment(s)
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-100 mt-4">
                      <button
                        onClick={() => handleOpenEditCreatorPost(post)}
                        className="p-2 text-zinc-600 hover:text-black hover:bg-zinc-100 transition-colors"
                        title="Edit Fit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setCreatorPostToDelete(post)}
                        className="p-2 text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Delete Fit"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Creator Post Add/Edit Modal */}
        {isEditingCreatorPost && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="relative w-full max-w-lg bg-white border border-zinc-200 p-4 sm:p-6 md:p-8 shadow-2xl rounded-none text-black animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => {
                  setIsEditingCreatorPost(false);
                  setFormCreatorPost({});
                }}
                className="absolute top-4 right-4 text-zinc-400 hover:text-black"
              >
                <X size={20} />
              </button>

              <h3 className="text-xl font-black uppercase tracking-tight mb-4">
                {formCreatorPost.id ? 'Edit Creator Fit' : 'Add Creator Fit'}
              </h3>

              <form onSubmit={handleSaveCreatorPostSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-black uppercase tracking-widest text-[9px] text-zinc-500 mb-1">
                    Model / Creator Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Marcus Vance"
                    value={formCreatorPost.creatorName || ''}
                    onChange={(e) => setFormCreatorPost({ ...formCreatorPost, creatorName: e.target.value })}
                    className="w-full border border-zinc-300 p-2 text-xs uppercase tracking-wider focus:outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="block font-black uppercase tracking-widest text-[9px] text-zinc-500 mb-1">
                    Social Handle *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="@marcus_fitz"
                    value={formCreatorPost.handle || ''}
                    onChange={(e) => setFormCreatorPost({ ...formCreatorPost, handle: e.target.value })}
                    className="w-full border border-zinc-300 p-2 text-xs focus:outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="block font-black uppercase tracking-widest text-[9px] text-zinc-500 mb-1">
                    Media File / URL *
                  </label>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="cursor-pointer bg-zinc-100 hover:bg-zinc-200 text-black px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-zinc-300">
                      Upload File
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const url = await handleFileUpload(file);
                            setFormCreatorPost({
                              ...formCreatorPost,
                              mediaUrl: url,
                              isVideo: file.type.startsWith('video/'),
                            });
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="https://... or data:..."
                    value={formCreatorPost.mediaUrl || ''}
                    onChange={(e) => setFormCreatorPost({ ...formCreatorPost, mediaUrl: e.target.value })}
                    className="w-full border border-zinc-300 p-2 text-xs focus:outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="block font-black uppercase tracking-widest text-[9px] text-zinc-500 mb-1">
                    Caption
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Fit description..."
                    value={formCreatorPost.caption || ''}
                    onChange={(e) => setFormCreatorPost({ ...formCreatorPost, caption: e.target.value })}
                    className="w-full border border-zinc-300 p-2 text-xs focus:outline-none focus:border-black resize-none"
                  />
                </div>

                <div>
                  <label className="block font-black uppercase tracking-widest text-[9px] text-zinc-500 mb-1">
                    Tagged Garment
                  </label>
                  <select
                    value={formCreatorPost.taggedProductIds?.[0] || ''}
                    onChange={(e) =>
                      setFormCreatorPost({
                        ...formCreatorPost,
                        taggedProductIds: e.target.value ? [e.target.value] : [],
                      })
                    }
                    className="w-full border border-zinc-300 p-2 text-xs uppercase focus:outline-none focus:border-black"
                  >
                    <option value="">No Tagged Garment</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingCreatorPost(false);
                      setFormCreatorPost({});
                    }}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-black"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingCreatorPost}
                    className="bg-black text-white px-6 py-2 text-xs font-black uppercase tracking-widest hover:bg-zinc-800 transition-colors"
                  >
                    {savingCreatorPost ? 'Saving...' : 'Save Creator Fit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Creator Post Delete Modal */}
        {creatorPostToDelete && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="relative w-full max-w-md bg-white border border-zinc-200 p-6 shadow-2xl rounded-none text-black">
              <h3 className="text-base font-black uppercase tracking-tight text-rose-600 mb-2">Delete Creator Fit</h3>
              <p className="text-xs text-zinc-600 mb-6">
                Delete creator fit by <strong className="text-black">{creatorPostToDelete.creatorName}</strong> ({creatorPostToDelete.handle})?
              </p>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setCreatorPostToDelete(null)}
                  className="px-4 py-2 text-xs font-bold uppercase text-zinc-500 hover:text-black"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDeleteCreatorPost}
                  className="bg-rose-600 text-white px-5 py-2 text-xs font-black uppercase tracking-widest hover:bg-rose-700"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* In-App Delete Confirmation Modal (Reliable in iFrame) */}
        {productToDelete && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div
              className="relative w-full max-w-md bg-white border border-zinc-200 p-6 md:p-8 shadow-2xl rounded-none text-black animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 text-rose-600 mb-4">
                <AlertTriangle size={24} />
                <h3 className="text-base font-black uppercase tracking-tight">Delete Garment</h3>
              </div>

              <p className="text-xs text-zinc-600 mb-6 leading-relaxed">
                Are you sure you want to permanently delete{' '}
                <strong className="text-black">"{productToDelete.name}"</strong>? This will remove it
                from the catalog, storefront, and search immediately.
              </p>

              {/* Garment Preview Card */}
              <div className="flex items-center gap-4 p-3 bg-zinc-50 border border-zinc-200 mb-6">
                <div className="w-12 h-14 bg-zinc-100 border border-zinc-200 shrink-0 overflow-hidden">
                  {productToDelete.imageUrl ? (
                    <ResolvedImage
                      src={productToDelete.imageUrl}
                      alt={productToDelete.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div style={{ backgroundColor: productToDelete.imageColor }} className="w-full h-full" />
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-black line-clamp-1">
                    {productToDelete.name}
                  </h4>
                  <div className="text-[10px] font-mono text-zinc-400 font-bold tabular-nums">
                    {formatPrice(productToDelete.price)} · {productToDelete.category}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setProductToDelete(null)}
                  className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-black transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-6 py-2.5 text-xs font-black uppercase tracking-[0.2em] transition-colors flex items-center gap-2 shadow-md"
                >
                  <Trash2 size={14} />
                  {isDeleting ? 'Deleting...' : 'Delete Garment'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
