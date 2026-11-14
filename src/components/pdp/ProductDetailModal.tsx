import React, { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronUp, ShoppingBag, Check, ShieldCheck, Truck, RefreshCw } from 'lucide-react';
import { Product, ProductVariant } from '../../types';
import { ResolvedImage } from '../common/ResolvedMedia';
import { formatPrice } from '../../utils';
import { Helmet } from '../common/Helmet';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product, size: string, quantity: number) => void;
}

const DEFAULT_SIZES: ProductVariant[] = [
  { size: 'S', stock: 12 },
  { size: 'M', stock: 18 },
  { size: 'L', stock: 15 },
  { size: 'XL', stock: 8 },
];

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onAddToCart,
}) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string>('M');
  const [quantity, setQuantity] = useState(1);
  const [addedNotice, setAddedNotice] = useState(false);
  const [openAccordion, setOpenAccordion] = useState<string | null>('details');

  // Collect all images for the product gallery
  const allImages: string[] = React.useMemo(() => {
    if (!product) return [];
    const list: string[] = [];
    if (product.imageUrl) list.push(product.imageUrl);
    if (product.galleryImages && product.galleryImages.length > 0) {
      product.galleryImages.forEach((img) => {
        if (img && !list.includes(img)) list.push(img);
      });
    }
    // If only 1 image exists, provide the generated macro fabric texture as an alternate angle
    if (list.length === 1) {
      list.push('/src/assets/images/fabric_texture_detail_1794493276268.jpg');
    }
    return list;
  }, [product]);

  // Determine variants
  const variants = product?.variants && product.variants.length > 0 ? product.variants : DEFAULT_SIZES;

  useEffect(() => {
    setSelectedImageIndex(0);
    setQuantity(1);
    setAddedNotice(false);
    if (variants.length > 0) {
      const firstInStock = variants.find((v) => v.stock > 0) || variants[0];
      setSelectedSize(firstInStock.size);
    }
  }, [product]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!product) return null;

  const currentVariant = variants.find((v) => v.size === selectedSize);
  const isOutOfStock = currentVariant ? currentVariant.stock <= 0 : false;

  const handleAdd = () => {
    if (isOutOfStock) return;
    onAddToCart(product, selectedSize, quantity);
    setAddedNotice(true);
    setTimeout(() => setAddedNotice(false), 2200);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 md:p-8 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <Helmet
        title={`${product.name} | Official Brotherhood Garment`}
        description={`${product.description || product.name} - Available now for ${formatPrice(product.price)}.`}
        ogType="product"
        ogImage={product.imageUrl}
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.name,
          description: product.description,
          image: product.imageUrl,
          offers: {
            '@type': 'Offer',
            price: product.price,
            priceCurrency: 'MWK',
            availability: isOutOfStock ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
          },
        }}
      />
      <div
        className="relative w-full max-w-5xl max-h-[92vh] bg-white border border-zinc-200 shadow-2xl overflow-y-auto flex flex-col md:flex-row text-black rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dismiss Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2.5 bg-white/90 hover:bg-black hover:text-white transition-colors border border-zinc-200"
          aria-label="Close Modal"
        >
          <X size={18} />
        </button>

        {/* Left Column: Multi-Angle Image Gallery */}
        <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col md:flex-row gap-4 bg-zinc-50 border-b md:border-b-0 md:border-r border-zinc-200">
          {/* Thumbnails strip */}
          {allImages.length > 1 && (
            <div className="flex md:flex-col gap-3 order-2 md:order-1 overflow-x-auto md:overflow-y-auto scrollbar-hide shrink-0">
              {allImages.map((imgSrc, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImageIndex(idx)}
                  className={`relative w-16 h-20 md:w-18 md:h-24 overflow-hidden border transition-all shrink-0 bg-white ${
                    selectedImageIndex === idx ? 'border-black ring-1 ring-black' : 'border-zinc-200 opacity-60 hover:opacity-100'
                  }`}
                >
                  <ResolvedImage src={imgSrc} alt={`${product.name} angle ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Large Main Viewport */}
          <div className="relative flex-grow aspect-[3/4] overflow-hidden bg-white border border-zinc-200 order-1 md:order-2 flex items-center justify-center">
            {allImages.length > 0 ? (
              <div className="w-full h-full">
                <ResolvedImage
                  src={allImages[selectedImageIndex]}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div
                style={{ backgroundColor: product.imageColor || '#E5E5E5' }}
                className="w-full h-full flex items-center justify-center text-zinc-400 text-xs font-black uppercase tracking-widest"
              >
                {product.category || 'Product'}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Contiguous Purchase Module */}
        <div className="w-full md:w-1/2 p-6 md:p-10 flex flex-col justify-between">
          <div>
            {/* Metadata */}
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-400 mb-2">
              <span>{product.category || 'Apparel'}</span>
            </div>

            <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight mb-3">
              {product.name}
            </h1>

            <div className="text-xl font-bold font-mono tabular-nums mb-6 text-black">
              {formatPrice(product.price)}
            </div>

            {/* Sizing Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-700">
                  Select Size
                </label>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  {currentVariant && currentVariant.stock > 0
                    ? `${currentVariant.stock} units remaining`
                    : 'Out of Stock'}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {variants.map((v) => {
                  const outOfStock = v.stock <= 0;
                  const isSelected = selectedSize === v.size;
                  return (
                    <button
                      key={v.size}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => setSelectedSize(v.size)}
                      className={`h-11 border text-xs font-black uppercase tracking-widest transition-all relative ${
                        isSelected
                          ? 'border-black bg-black text-white'
                          : outOfStock
                          ? 'border-zinc-200 bg-zinc-100 text-zinc-400 cursor-not-allowed line-through'
                          : 'border-zinc-300 bg-white text-black hover:border-black'
                      }`}
                    >
                      {v.size}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quantity Stepper & Buy Action */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center border border-zinc-300 h-12 px-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-2 text-sm font-bold text-zinc-500 hover:text-black"
                >
                  -
                </button>
                <span className="w-8 text-center text-xs font-bold font-mono tabular-nums">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="px-2 text-sm font-bold text-zinc-500 hover:text-black"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                onClick={handleAdd}
                disabled={isOutOfStock}
                className={`flex-grow h-12 text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2.5 transition-all shadow-md ${
                  addedNotice
                    ? 'bg-zinc-800 text-white'
                    : isOutOfStock
                    ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                    : 'bg-black text-white hover:bg-zinc-800'
                }`}
              >
                {addedNotice ? (
                  <>
                    <Check size={16} />
                    Added to Bag
                  </>
                ) : isOutOfStock ? (
                  'Sold Out'
                ) : (
                  <>
                    <ShoppingBag size={16} />
                    Add to Bag · {formatPrice(product.price * quantity)}
                  </>
                )}
              </button>
            </div>

            {/* Editorial Accordions */}
            <div className="border-t border-zinc-200 divide-y divide-zinc-200 text-xs">
              {/* Accordion 1: Details */}
              <div>
                <button
                  type="button"
                  onClick={() => setOpenAccordion(openAccordion === 'details' ? null : 'details')}
                  className="w-full py-3.5 flex items-center justify-between text-left font-black uppercase tracking-widest text-[10px] text-zinc-800 hover:text-black"
                >
                  <span>Fabric & Craftsmanship</span>
                  {openAccordion === 'details' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {openAccordion === 'details' && (
                  <div className="pb-4 text-zinc-600 text-xs leading-relaxed space-y-2">
                    <p>
                      Crafted from custom 420GSM heavyweight Japanese combed cotton with a washed vintage patina. Designed with an intentional drop-shoulder silhouette and reinforced twin-needle hems.
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-[11px] text-zinc-500">
                      <li>100% Pre-shrunk compact ring-spun cotton</li>
                      <li>Double-ply ribbed neck collar for shape retention</li>
                      <li>Tailored boxy drape, true to size for oversized fit</li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Accordion 2: Delivery & Shipping */}
              <div>
                <button
                  type="button"
                  onClick={() => setOpenAccordion(openAccordion === 'shipping' ? null : 'shipping')}
                  className="w-full py-3.5 flex items-center justify-between text-left font-black uppercase tracking-widest text-[10px] text-zinc-800 hover:text-black"
                >
                  <span>Complimentary Shipping & Returns</span>
                  {openAccordion === 'shipping' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {openAccordion === 'shipping' && (
                  <div className="pb-4 text-zinc-600 text-xs leading-relaxed space-y-2">
                    <div className="flex items-center gap-2 text-zinc-700 font-bold text-[11px]">
                      <Truck size={14} /> Express carbon-neutral courier delivery
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      Orders dispatched within 24 hours. Worldwide tracking provided upon dispatch. 14-day hassle-free returns on all unworn items with original garment tags attached.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Trust markers */}
          <div className="pt-6 border-t border-zinc-100 flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-zinc-400">
            <span className="flex items-center gap-1.5"><ShieldCheck size={12} /> Authentic Garment</span>
            <span className="flex items-center gap-1.5"><RefreshCw size={12} /> 14-Day Exchanges</span>
          </div>
        </div>
      </div>
    </div>
  );
};
