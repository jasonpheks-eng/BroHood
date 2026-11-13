import React, { useState } from 'react';
import { X, Trash2, ShoppingBag, ArrowRight, ShieldCheck, Check, MessageCircle } from 'lucide-react';
import { CartItem, Settings } from '../../types';
import { ResolvedImage } from './ResolvedMedia';
import { formatPrice, formatWhatsAppDigits } from '../../utils';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  settings: Settings;
  onUpdateQuantity: (id: string, delta: number, size?: string) => void;
  onRemoveItem: (id: string, size?: string) => void;
  onClearCart: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cart,
  settings,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
}) => {
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  if (!isOpen) return null;

  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const finalTotal = subtotal;
  const freeShippingThreshold = 150;
  const progressToFreeShipping = Math.min(100, (subtotal / freeShippingThreshold) * 100);
  const shippingCost = subtotal >= freeShippingThreshold ? 0 : 15;
  const grandTotal = finalTotal + shippingCost;

  const whatsappDigits = formatWhatsAppDigits(settings.whatsappNumber);
  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  const getPublicImageUrl = (rawUrl?: string): string => {
    if (!rawUrl) return '';
    const trimmed = rawUrl.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('/assets/') && baseOrigin) return `${baseOrigin}${trimmed}`;
    return '';
  };

  const orderLines = [
    `*New Order — ${settings.brandName || 'BROTHERHOOD'}*`,
    '',
    ...cart.flatMap((item, idx) => {
      const productUrl =
        item.id && baseOrigin
          ? `${baseOrigin}/?product=${encodeURIComponent(item.id)}`
          : '';
      const photoUrl = getPublicImageUrl(item.imageUrl);
      const itemLines = [
        `${idx + 1}. ${item.name} (Size: ${item.selectedSize || 'OS'}) x${item.quantity} — ${formatPrice(
          item.price * item.quantity
        )}`,
      ];
      if (productUrl) itemLines.push(`Link: ${productUrl}`);
      if (photoUrl) itemLines.push(`Photo: ${photoUrl}`);
      return itemLines;
    }),
    '',
    `Subtotal: ${formatPrice(subtotal)}`,
    `Shipping: ${shippingCost === 0 ? 'Complimentary' : formatPrice(shippingCost)}`,
    `*Total: ${formatPrice(grandTotal)}*`,
  ];
  const whatsappText = orderLines.join('\n');
  const whatsappUrl = whatsappDigits
    ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(whatsappText)}`
    : `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;

  const handleCheckout = () => {
    setCheckoutSuccess(true);
    setTimeout(() => {
      setCheckoutSuccess(false);
    }, 5000);
  };

  return (
    <div className="fixed inset-0 z-[150] flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between border-l border-zinc-200 text-black rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} />
            <h2 className="text-sm font-black uppercase tracking-[0.2em]">Shopping Bag</h2>
            <span className="font-mono text-xs text-zinc-400 tabular-nums">
              ({cart.reduce((sum, item) => sum + item.quantity, 0)})
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-black transition-colors"
            aria-label="Close Bag"
          >
            <X size={18} />
          </button>
        </div>

        {/* Free Shipping Tier Bar */}
        <div className="bg-zinc-50 px-6 py-3 border-b border-zinc-100 text-xs">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-1.5">
            <span>
              {subtotal >= freeShippingThreshold
                ? 'Complimentary Express Shipping Unlocked'
                : `Add ${formatPrice(freeShippingThreshold - subtotal)} for Free Shipping`}
            </span>
            <span className="font-mono tabular-nums">{Math.round(progressToFreeShipping)}%</span>
          </div>
          <div className="w-full h-1 bg-zinc-200 overflow-hidden">
            <div
              className="h-full bg-black transition-all duration-300"
              style={{ width: `${progressToFreeShipping}%` }}
            />
          </div>
        </div>

        {/* Cart Item List */}
        <div className="flex-grow overflow-y-auto p-6 divide-y divide-zinc-100">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-zinc-400 space-y-4 py-16">
              <ShoppingBag size={40} strokeWidth={1} />
              <p className="text-xs font-black uppercase tracking-widest">Your bag is currently empty</p>
              <button
                onClick={onClose}
                className="bg-black text-white px-6 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-colors"
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div key={`${item.id}-${item.selectedSize || 'default'}-${idx}`} className="py-4 flex gap-4">
                {/* Thumbnail */}
                <div className="w-20 h-24 bg-zinc-100 overflow-hidden shrink-0 border border-zinc-200">
                  {item.imageUrl ? (
                    <ResolvedImage src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      style={{ backgroundColor: item.imageColor || '#E5E5E5' }}
                      className="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 uppercase font-black"
                    >
                      {item.category}
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-grow flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-black uppercase tracking-wider line-clamp-1">
                        {item.name}
                      </h4>
                      <button
                        onClick={() => onRemoveItem(item.id || '', item.selectedSize)}
                        className="text-zinc-400 hover:text-black transition-colors"
                        aria-label="Remove item"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
                      <span>Size: {item.selectedSize || 'OS'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-black">{formatPrice(item.price)}</span>
                    </div>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center border border-zinc-200 h-7 px-2">
                      <button
                        onClick={() => onUpdateQuantity(item.id || '', -1, item.selectedSize)}
                        className="px-1 text-xs font-bold text-zinc-500 hover:text-black"
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-xs font-mono font-bold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => onUpdateQuantity(item.id || '', 1, item.selectedSize)}
                        className="px-1 text-xs font-bold text-zinc-500 hover:text-black"
                      >
                        +
                      </button>
                    </div>

                    <span className="text-xs font-bold font-mono tabular-nums">
                      {formatPrice(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer & Checkout */}
        {cart.length > 0 && (
          <div className="p-6 border-t border-zinc-200 bg-white space-y-4">
            {/* Subtotal */}
            <div className="space-y-1.5 pt-2 border-t border-zinc-100 text-xs">
              <div className="flex justify-between text-zinc-500 uppercase font-bold text-[10px] tracking-widest">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums text-black">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-zinc-500 uppercase font-bold text-[10px] tracking-widest">
                <span>Shipping</span>
                <span>{shippingCost === 0 ? 'Complimentary' : formatPrice(shippingCost)}</span>
              </div>
              <div className="flex justify-between text-black font-black uppercase text-sm tracking-wider pt-2 border-t border-zinc-100">
                <span>Total</span>
                <span className="font-mono tabular-nums">
                  {formatPrice(grandTotal)}
                </span>
              </div>
            </div>

            {/* Proceed to WhatsApp Checkout Action */}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleCheckout}
              className={`group w-full px-5 py-4 border text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-between transition-all duration-200 shadow-md active:scale-[0.99] ${
                checkoutSuccess
                  ? 'bg-[#1EBE5D] border-[#1EBE5D] text-white'
                  : 'bg-[#25D366] border-[#25D366] text-white hover:bg-[#20bd5a] hover:border-[#20bd5a]'
              }`}
            >
              {checkoutSuccess ? (
                <span className="w-full flex items-center justify-center gap-2.5 text-white">
                  <Check size={16} className="text-white shrink-0" />
                  <span>Opening WhatsApp Order...</span>
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-2.5 whitespace-nowrap text-white">
                    <MessageCircle size={17} className="text-white fill-white/20 shrink-0" />
                    <span>Checkout via WhatsApp</span>
                  </span>
                  <ArrowRight
                    size={15}
                    className="text-white group-hover:translate-x-1 transition-all shrink-0"
                  />
                </>
              )}
            </a>

            {checkoutSuccess && (
              <button
                type="button"
                onClick={() => {
                  onClearCart();
                  setCheckoutSuccess(false);
                  onClose();
                }}
                className="w-full py-2 border border-zinc-200 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 hover:text-black hover:border-black transition-colors"
              >
                Order Sent — Clear Bag
              </button>
            )}

            <div className="flex items-center justify-center gap-2 text-[9px] font-bold uppercase tracking-widest text-zinc-400">
              <ShieldCheck size={12} />
              <span>Direct WhatsApp Order Concierge</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
