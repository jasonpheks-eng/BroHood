import React, { useState, useRef, useEffect } from 'react';
import { Instagram, ShoppingBag, Plus, Sparkles, Tag, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { Product, CreatorPost, Settings } from '../../types';
import { ResolvedImage, ResolvedVideo, useResolvedMedia } from '../common/ResolvedMedia';
import { getEmbedVideoInfo } from '../../mediaUrlUtils';
import { formatPrice } from '../../utils';
import { CreatorSubmissionModal } from './CreatorSubmissionModal';

interface CreatorsClubSectionProps {
  settings: Settings;
  products: Product[];
  creatorPosts: CreatorPost[];
  onQuickView: (product: Product) => void;
  onAddToCart: (product: Product, size?: string) => void;
  onSubmitPost: (post: Omit<CreatorPost, 'id' | 'createdAt'>) => Promise<void>;
}

// Media Card Component for Masonry Grid / Horizontal Rail
const CreatorPostCard: React.FC<{
  post: CreatorPost;
  products: Product[];
  onQuickView: (product: Product) => void;
  onAddToCart: (product: Product, size?: string) => void;
  cardClassName?: string;
}> = ({ post, products, onQuickView, onAddToCart, cardClassName = '' }) => {
  const [showShopPopover, setShowShopPopover] = useState(false);
  const embedInfo = getEmbedVideoInfo(post.mediaUrl);
  const resolvedMedia = useResolvedMedia(embedInfo.isEmbed ? '' : post.mediaUrl);
  const isVideo =
    embedInfo.isEmbed ||
    post.isVideo ||
    (post.mediaUrl && post.mediaUrl.startsWith('idb://vid_')) ||
    Boolean(resolvedMedia && (resolvedMedia.endsWith('.mp4') || resolvedMedia.includes('data:video/')));

  // Match tagged products
  const taggedProducts = (post.taggedProductIds || [])
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean) as Product[];

  return (
    <div className={`relative group overflow-hidden bg-zinc-900 border border-white/10 transition-all duration-300 hover:border-white/30 ${cardClassName}`}>
      {/* Background Media */}
      <div className="relative w-full aspect-[3/4] overflow-hidden bg-black">
        {isVideo ? (
          <ResolvedVideo
            src={post.mediaUrl}
            muted
            loop
            playsInline
            autoPlay
            className="w-full h-full object-cover pointer-events-none transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <ResolvedImage
            src={post.mediaUrl}
            alt={post.creatorName || post.handle}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}

        {/* Gradient Overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />

        {/* Content Callout */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5 flex flex-col justify-end text-white z-10">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-wider uppercase text-white line-clamp-1">
                {post.creatorName}
              </span>
              <span className="text-[10px] font-mono text-white/60">{post.handle}</span>
            </div>

            {post.socialLink && (
              <a
                href={post.socialLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-white transition-colors p-1"
                title={`Visit ${post.handle}`}
              >
                <Instagram size={14} />
              </a>
            )}
          </div>

          {post.caption && (
            <p className="text-[11px] text-white/70 line-clamp-2 font-light mb-3">
              "{post.caption}"
            </p>
          )}

          {/* Action Row */}
          <div className="flex items-center justify-between pt-2 border-t border-white/10 gap-2">
            {taggedProducts.length > 0 ? (
              <div className="relative w-full">
                <button
                  onClick={() => setShowShopPopover(!showShopPopover)}
                  className="w-full bg-white/10 hover:bg-white text-white hover:text-black py-2 px-3 text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-between"
                >
                  <span className="flex items-center gap-1.5">
                    <Tag size={12} /> Shop Worn Fit ({taggedProducts.length})
                  </span>
                  <span className="font-mono">{showShopPopover ? '▲' : '▼'}</span>
                </button>

                {/* Tagged Garments Popover */}
                {showShopPopover && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 bg-white text-black p-3 shadow-2xl border border-zinc-200 z-30 space-y-2 animate-in fade-in zoom-in-95 duration-150">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 border-b pb-1">
                      Garments Tagged in Fit
                    </p>
                    {taggedProducts.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between gap-2 p-1.5 hover:bg-zinc-100 transition-colors"
                      >
                        <div className="truncate cursor-pointer" onClick={() => onQuickView(product)}>
                          <p className="text-[10px] font-bold uppercase truncate">{product.name}</p>
                          <p className="text-[9px] font-mono text-zinc-500">{formatPrice(product.price)}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => onQuickView(product)}
                            className="p-1 text-zinc-600 hover:text-black"
                            title="Quick View"
                          >
                            <Eye size={12} />
                          </button>
                          <button
                            onClick={() => onAddToCart(product)}
                            className="bg-black text-white p-1 text-[9px] font-bold uppercase hover:bg-zinc-800"
                            title="Add to Bag"
                          >
                            <ShoppingBag size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="w-full bg-white/10 text-white/75 py-2 px-3 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1 cursor-default"
              >
                <ShoppingBag size={12} /> Explore Garment
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const CreatorsClubSection: React.FC<CreatorsClubSectionProps> = ({
  settings,
  products,
  creatorPosts,
  onQuickView,
  onAddToCart,
  onSubmitPost,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'video' | 'photo'>('all');
  const [hoverScrollDir, setHoverScrollDir] = useState<'left' | 'right' | null>(null);
  const mediaRailRef = useRef<HTMLDivElement>(null);
  const hoverVelocityRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  const filteredPosts = creatorPosts.filter((post) => {
    if (filter === 'video') return post.isVideo;
    if (filter === 'photo') return !post.isVideo;
    return true;
  });

  useEffect(() => {
    const stepScroll = () => {
      const el = mediaRailRef.current;
      const v = hoverVelocityRef.current;
      if (el && v !== 0) {
        el.scrollLeft += v;
        rafIdRef.current = requestAnimationFrame(stepScroll);
      } else {
        rafIdRef.current = null;
      }
    };

    if (hoverScrollDir) {
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(stepScroll);
      }
    } else if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [hoverScrollDir]);

  // Reset rail scroll position smoothly when switching filters
  useEffect(() => {
    hoverVelocityRef.current = 0;
    setHoverScrollDir(null);
    if (mediaRailRef.current) {
      mediaRailRef.current.scrollLeft = 0;
    }
  }, [filter]);

  const handleRailMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = mediaRailRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const rect = el.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;

    // Outer 18% left/right hover zones glide the creator fits horizontally
    if (ratio < 0.18) {
      const strength = (0.18 - ratio) / 0.18;
      hoverVelocityRef.current = -(3 + strength * 9);
      if (hoverScrollDir !== 'left') setHoverScrollDir('left');
    } else if (ratio > 0.82) {
      const strength = (ratio - 0.82) / 0.18;
      hoverVelocityRef.current = 3 + strength * 9;
      if (hoverScrollDir !== 'right') setHoverScrollDir('right');
    } else {
      hoverVelocityRef.current = 0;
      if (hoverScrollDir !== null) setHoverScrollDir(null);
    }
  };

  const handleRailMouseLeave = () => {
    hoverVelocityRef.current = 0;
    setHoverScrollDir(null);
  };

  const scrollMediaRail = (direction: 'left' | 'right') => {
    if (!mediaRailRef.current) return;
    const step = Math.max(280, Math.round(mediaRailRef.current.clientWidth * 0.75));
    mediaRailRef.current.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth',
    });
  };

  return (
    <section
      id="lookbook-section"
      className="relative w-full bg-[#121212] text-white py-20 px-6 lg:px-12 overflow-hidden border-t border-b border-zinc-900"
    >
      <div className="max-w-[1600px] mx-auto">
        {/* Header Contract */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 pb-6 border-b border-white/10 gap-6">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-2">
              <span>BROTHERHOOD</span>
              <span aria-hidden="true">·</span>
              <span>CREATORS CLUB</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-serif italic font-semibold tracking-tight text-white">
              Community Fits & Model Archive
            </h2>
          </div>

          {/* Action Row & Filter */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Filter segmented buttons */}
            <div className="flex items-center gap-1 p-1 bg-white/5 border border-white/10">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                  filter === 'all' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                }`}
              >
                All Fits ({creatorPosts.length})
              </button>
              <button
                onClick={() => setFilter('video')}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                  filter === 'video' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                }`}
              >
                Clips
              </button>
              <button
                onClick={() => setFilter('photo')}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                  filter === 'photo' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                }`}
              >
                Stills
              </button>
            </div>

            {/* Horizontal scroll controls */}
            {filteredPosts.length > 1 && (
              <div className="hidden sm:flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => scrollMediaRail('left')}
                  aria-label="Scroll Left"
                  className={`p-2 border transition-colors ${
                    hoverScrollDir === 'left'
                      ? 'border-white bg-white text-black'
                      : 'border-white/15 bg-white/5 text-white/80 hover:bg-white hover:text-black'
                  }`}
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollMediaRail('right')}
                  aria-label="Scroll Right"
                  className={`p-2 border transition-colors ${
                    hoverScrollDir === 'right'
                      ? 'border-white bg-white text-black'
                      : 'border-white/15 bg-white/5 text-white/80 hover:bg-white hover:text-black'
                  }`}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}

            {/* Join CTA */}
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-white text-black px-6 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all shadow-lg flex items-center gap-2 shrink-0"
            >
              <Plus size={14} /> Join Creators Club
            </button>
          </div>
        </div>

        {/* Horizontal Hover-Scrollable Lookbook Rail */}
        {filteredPosts.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-white/10 space-y-4">
            <Sparkles size={36} className="mx-auto text-white/30" />
            <p className="text-xs font-black uppercase tracking-widest text-white/50">
              No creator fits found in this view. Be the first to share your fit!
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-white text-black px-6 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 transition-colors"
            >
              Submit Your Fit
            </button>
          </div>
        ) : (
          <div
            ref={mediaRailRef}
            onMouseMove={handleRailMouseMove}
            onMouseLeave={handleRailMouseLeave}
            className={`flex overflow-x-auto overscroll-x-contain scrollbar-hide gap-5 sm:gap-6 pb-4 -mx-6 px-6 lg:mx-0 lg:px-0 ${
              hoverScrollDir ? '' : 'snap-x snap-proximity'
            }`}
          >
            {filteredPosts.map((post) => (
              <CreatorPostCard
                key={post.id}
                post={post}
                products={products}
                onQuickView={onQuickView}
                onAddToCart={onAddToCart}
                cardClassName="w-[76vw] max-w-[300px] sm:w-[290px] md:w-[320px] shrink-0 snap-start"
              />
            ))}
          </div>
        )}
      </div>

      {/* Customer Submission Modal */}
      <CreatorSubmissionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        products={products}
        settings={settings}
        onSubmitPost={onSubmitPost}
      />
    </section>
  );
};
