import React from 'react';
import { Eye, Plus } from 'lucide-react';
import { Product } from '../../types';
import { ResolvedImage } from './ResolvedMedia';
import { formatPrice } from '../../utils';

interface StoreProductCardProps {
  product: Product;
  onAddToCart: (product: Product, size?: string) => void;
  onQuickView: (product: Product) => void;
  onCategoryClick?: (category: string) => void;
}

function resolveProductCategory(product: Product): string {
  const raw = (product.category || '').trim().toUpperCase();
  if (raw && raw !== 'APPAREL') return raw;
  const name = (product.name || '').toLowerCase();
  if (/\bcap|hat|beanie\b/.test(name)) return 'CAPS';
  if (/\bhoddie|hoodie\b/.test(name)) return 'HOODIES';
  if (/\blong sleeve\b/.test(name)) return 'LONG SLEEVES';
  if (/\bshirt|tee\b/.test(name)) return 'SHIRTS';
  if (/\bshort\b/.test(name)) return 'SHORTS';
  if (/\bpant|trouser|jogger|jean\b/.test(name)) return 'PANTS';
  if (/\bjacket|coat\b/.test(name)) return 'JACKETS';
  return raw || 'APPAREL';
}

export const StoreProductCard: React.FC<StoreProductCardProps> = ({
  product,
  onAddToCart,
  onQuickView,
  onCategoryClick,
}) => {
  const hasVariants = product.variants && product.variants.length > 0;
  const isOutOfStock = product.totalStock !== undefined && product.totalStock <= 0;
  const targetCategory = resolveProductCategory(product);

  return (
    <div className="group relative flex flex-col h-full bg-white border border-zinc-200/80 transition-all duration-300">
      {/* Product Image Stage */}
      <div
        onClick={() => onQuickView(product)}
        className="relative aspect-[3/4] w-full overflow-hidden bg-[#F4F4F4] cursor-pointer flex items-center justify-center border-b border-zinc-100"
      >
        {product.imageUrl ? (
          <ResolvedImage
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div
            style={{ backgroundColor: product.imageColor || '#E5E5E5' }}
            className="w-full h-full flex items-center justify-center text-zinc-400 text-xs font-black uppercase tracking-widest"
          >
            {product.category || 'Garment'}
          </div>
        )}

        {/* Out of Stock Ribbon / Limited Tag */}
        {isOutOfStock ? (
          <div className="absolute top-3 left-3 bg-black text-white px-2.5 py-1 text-[9px] font-black uppercase tracking-widest">
            Sold Out
          </div>
        ) : null}

        {/* Quick View Hover Action Overlay */}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickView(product);
            }}
            className="bg-white text-black px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.2em] shadow-lg hover:bg-black hover:text-white transition-all flex items-center gap-2 transform translate-y-2 group-hover:translate-y-0"
          >
            <Eye size={13} />
            Quick View
          </button>
        </div>
      </div>

      {/* Product Information */}
      <div className="px-4 pt-4 pb-4 flex flex-col flex-grow justify-between bg-white">
        <div>
          {/* Metadata */}
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-1.5">
            <span
              onClick={
                onCategoryClick
                  ? (e) => {
                      e.stopPropagation();
                      onCategoryClick(targetCategory);
                    }
                  : undefined
              }
              className={
                onCategoryClick
                  ? 'cursor-pointer hover:text-black hover:underline underline-offset-4 transition-colors'
                  : undefined
              }
              title={onCategoryClick ? `Show all ${targetCategory.toLowerCase()}` : undefined}
            >
              {product.category || 'Apparel'}
            </span>
          </div>

          <h3
            onClick={() => onQuickView(product)}
            style={{ fontFamily: 'Verdana, sans-serif', fontSize: '15px' }}
            className="font-bold text-black uppercase tracking-wide leading-snug mb-2 cursor-pointer hover:underline underline-offset-4 line-clamp-2"
          >
            {product.name}
          </h3>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-zinc-100 mt-2">
          <span
            style={{ fontFamily: 'Verdana, sans-serif' }}
            className="text-sm font-bold text-black tabular-nums"
          >
            {formatPrice(product.price)}
          </span>

          <button
            onClick={() => {
              if (hasVariants) {
                // If it has multiple sizes, open quick view to let user select size
                onQuickView(product);
              } else {
                onAddToCart(product);
              }
            }}
            disabled={isOutOfStock}
            className={`text-[9px] font-black uppercase tracking-[0.18em] px-3 py-1.5 transition-all flex items-center gap-1.5 ${
              isOutOfStock
                ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                : 'bg-black text-white hover:bg-zinc-800'
            }`}
          >
            <Plus size={12} />
            {hasVariants ? 'Select Size' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
};
