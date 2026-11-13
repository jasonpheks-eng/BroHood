import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, ArrowRight, Sparkles } from 'lucide-react';
import { Product, LookbookSpread } from '../../types';
import { ResolvedImage } from '../common/ResolvedMedia';
import { formatPrice } from '../../utils';

interface LookbookSectionProps {
  products: Product[];
  onQuickView: (product: Product) => void;
  onAddToCart: (product: Product, size?: string) => void;
}

const DEFAULT_LOOKBOOK_SPREADS: LookbookSpread[] = [
  {
    id: 'spread-1',
    title: 'Look 01 · Monumental Silhouette',
    subtitle: 'The Brutalist Heavyweight Fleece & Architectural Cargo',
    imageUrl: '/src/assets/images/lookbook_hoodie_capsule_1794493275541.jpg',
    description: 'Constructed from dense 450GSM raw cotton, engineered with dropped shoulder proportions and articulated knee darts for effortless drape.',
    hotspots: [
      {
        id: 'hs-1',
        productId: '', // will resolve dynamically to first hoodie or matching garment
        xPercent: 50,
        yPercent: 32,
        label: 'Heavyweight Fleece Hoodie',
      },
      {
        id: 'hs-2',
        productId: '',
        xPercent: 48,
        yPercent: 68,
        label: 'Architectural Cargo Trouser',
      },
    ],
  },
  {
    id: 'spread-2',
    title: 'Look 02 · Urban Tailoring',
    subtitle: 'Structured Poplin Long Sleeve & Heritage Low-Profile Cap',
    imageUrl: '/src/assets/images/lookbook_tailored_capsule_1794493275320.jpg',
    description: 'Clean utilitarian lines paired with minimalist everyday headwear. A uniform engineered for metropolitan movement.',
    hotspots: [
      {
        id: 'hs-3',
        productId: '',
        xPercent: 57,
        yPercent: 42,
        label: 'Structured Long Sleeve Overshirt',
      },
      {
        id: 'hs-4',
        productId: '',
        xPercent: 56,
        yPercent: 19,
        label: 'Heritage Cotton Cap',
      },
    ],
  },
];

export const LookbookSection: React.FC<LookbookSectionProps> = ({
  products,
  onQuickView,
  onAddToCart,
}) => {
  const [activeSpreadIndex, setActiveSpreadIndex] = useState(0);
  const [activeHotspotId, setActiveHotspotId] = useState<string | null>(null);

  const spreads = DEFAULT_LOOKBOOK_SPREADS;
  const currentSpread = spreads[activeSpreadIndex];

  // Helper to find a product for a hotspot
  const findProductForHotspot = (label?: string) => {
    if (!products || products.length === 0) return null;
    if (!label) return products[0];

    const lower = label.toLowerCase();
    const match = products.find(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        (lower.includes('hoodie') && p.category.toLowerCase().includes('hoodie')) ||
        (lower.includes('cargo') && p.category.toLowerCase().includes('pant')) ||
        (lower.includes('trouser') && p.category.toLowerCase().includes('pant')) ||
        (lower.includes('cap') && p.category.toLowerCase().includes('cap')) ||
        (lower.includes('sleeve') && p.category.toLowerCase().includes('sleeve'))
    );
    return match || products[0];
  };

  const handleNext = () => {
    setActiveHotspotId(null);
    setActiveSpreadIndex((prev) => (prev + 1) % spreads.length);
  };

  const handlePrev = () => {
    setActiveHotspotId(null);
    setActiveSpreadIndex((prev) => (prev - 1 + spreads.length) % spreads.length);
  };

  return (
    <section className="relative w-full bg-[#121212] text-white py-20 px-6 lg:px-12 overflow-hidden" id="lookbook-section">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6 border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-2">
              <span>Editorial Campaign</span>
              <span aria-hidden="true">·</span>
              <span>Lookbook 2026</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-serif italic font-semibold tracking-tight text-white">
              {currentSpread.title}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-white/60 tabular-nums uppercase tracking-widest">
              Spread 0{activeSpreadIndex + 1} / 0{spreads.length}
            </span>
            <div className="flex items-center gap-1 border border-white/20">
              <button
                onClick={handlePrev}
                className="p-3 hover:bg-white hover:text-black transition-colors"
                aria-label="Previous Spread"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={handleNext}
                className="p-3 hover:bg-white hover:text-black transition-colors border-l border-white/20"
                aria-label="Next Spread"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Spread Main Stage */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Visual Canvas with Hotspots */}
          <div className="lg:col-span-8 relative aspect-[16/9] w-full overflow-hidden bg-black border border-white/10 group">
            <ResolvedImage
              src={currentSpread.imageUrl}
              alt={currentSpread.title}
              className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
            />

            {/* Gradient Scrim for subtle contrast */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

            {/* Hotspot Pins */}
            {currentSpread.hotspots.map((hs, idx) => {
              const matchedProduct = findProductForHotspot(hs.label);
              const isActive = activeHotspotId === hs.id;

              return (
                <div
                  key={hs.id}
                  className="absolute z-20"
                  style={{ top: `${hs.yPercent}%`, left: `${hs.xPercent}%` }}
                >
                  {/* Pin Trigger */}
                  <button
                    onClick={() => setActiveHotspotId(isActive ? null : hs.id)}
                    className="relative -translate-x-1/2 -translate-y-1/2 group/pin cursor-pointer focus:outline-none"
                    aria-label={`View ${hs.label}`}
                  >
                    <span className="absolute -inset-2 bg-white/20 rounded-full animate-ping opacity-75" />
                    <span className="relative flex items-center justify-center w-7 h-7 bg-white text-black text-[10px] font-black uppercase shadow-2xl transition-transform duration-200 group-hover/pin:scale-125 border border-black">
                      0{idx + 1}
                    </span>
                  </button>

                  {/* Hotspot Garment Card Popover */}
                  {isActive && matchedProduct && (
                    <div
                      className="absolute z-30 left-1/2 -translate-x-1/2 mt-3 w-64 bg-white text-black p-4 shadow-2xl border border-zinc-200 animate-in fade-in zoom-in-95 duration-150 rounded-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-1">
                        <span>Tag 0{idx + 1}</span>
                        <span className="font-mono tabular-nums text-black font-bold">
                          {formatPrice(matchedProduct.price)}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold uppercase tracking-wider mb-2 text-black line-clamp-1">
                        {hs.label || matchedProduct.name}
                      </h4>

                      <div className="pt-2 border-t border-zinc-100">
                        <button
                          onClick={() => {
                            onAddToCart(matchedProduct);
                            setActiveHotspotId(null);
                          }}
                          className="w-full bg-black text-white py-2 text-[9px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1.5"
                        >
                          Add to Bag
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Interactive hint */}
            <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-sm border border-white/20 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white/80 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              Click pins to view garments
            </div>
          </div>

          {/* Editorial Story Column */}
          <div className="lg:col-span-4 flex flex-col justify-between bg-zinc-900/60 p-8 border border-white/10">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-3">
                Silhouette Notes
              </p>
              <h3 className="text-xl font-bold uppercase tracking-wider text-white mb-4">
                {currentSpread.subtitle}
              </h3>
              <p className="text-sm text-white/70 leading-relaxed font-light mb-8">
                {currentSpread.description}
              </p>

              {/* Tagged Products in this Look */}
              <div className="space-y-3 pt-6 border-t border-white/10">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                  Featured in this look
                </p>
                {currentSpread.hotspots.map((hs, i) => {
                  const p = findProductForHotspot(hs.label);
                  if (!p) return null;
                  return (
                    <div
                      key={hs.id}
                      onClick={() => onQuickView(p)}
                      className="group/item flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-white/40">0{i + 1}</span>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-white group-hover/item:text-white line-clamp-1">
                            {hs.label || p.name}
                          </p>
                          <p className="text-[10px] text-white/40 font-mono tabular-nums">
                            {formatPrice(p.price)}
                          </p>
                        </div>
                      </div>
                      <ArrowRight size={14} className="text-white/40 group-hover/item:text-white group-hover/item:translate-x-1 transition-all" />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-8 border-t border-white/10">
              <button
                onClick={() => {
                  window.location.hash = 'shop';
                }}
                className="w-full bg-white text-black py-3.5 text-xs font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
              >
                Shop Full Collection
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
