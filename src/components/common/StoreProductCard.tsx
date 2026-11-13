import React from 'react';
import { Eye, Plus } from 'lucide-react';
import { Product } from '../../types';
import { ResolvedImage } from './ResolvedMedia';
import { formatPrice } from '../../utils';

interface StoreProductCardProps {
  product: Product;
  onAddToCart: (product: Product, size?: string) => void;
  onQuickView: (product: Product) => void;
}

export const StoreProductCard: React.FC<StoreProductCardProps> = ({
  product,
  onAddToCart,
  onQuickView,
}) => {
  const hasVariants = product.variants && product.variants.length > 0;
  const isOutOfStock = product.totalStock !== undefined && product.totalStock <= 0;

  return (
    <div className="group relative flex flex-col h-full bg-white transition-all duration-300">
      {/* Product Image Stage */}
      <div
        onClick={() => onQuickView(product)}
        className="relative aspect-[3/4] w-full overflow-hidden bg-[#F4F4F4] cursor-pointer flex items-center justify-center border border-zinc-100"
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
      <div className="pt-4 pb-2 flex flex-col flex-grow justify-between">
        <div>
          {/* Metadata */}
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-1.5">
            <span>{product.category || 'Apparel'}</span>
          </div>

          <h3
            onClick={() => onQuickView(product)}
            className="text-sm font-bold text-black uppercase tracking-wider mb-2 cursor-pointer hover:underline underline-offset-4 line-clamp-1"
          >
            {product.name}
          </h3>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-zinc-100 mt-2">
          <span className="text-sm font-bold text-black font-mono tabular-nums">
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
