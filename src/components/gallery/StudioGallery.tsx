import React from 'react';
import { ArrowUpRight, Image as ImageIcon } from 'lucide-react';
import {
  GalleryTextAnimation,
  GalleryTextPosition,
  GalleryTileSize,
  StudioGalleryState,
} from '../../types';
import { ResolvedImage, ResolvedVideo } from '../common/ResolvedMedia';
import { inferMediaType } from '../../hooks/useStudioGalleryState';
import { cn } from '../../utils';

interface StudioGalleryProps {
  state: StudioGalleryState;
  brandName?: string;
  onExploreClick?: () => void;
  className?: string;
}

const SIZE_CLASSES: Record<GalleryTileSize, string> = {
  '1x1': 'col-span-1 row-span-1',
  '2x1': 'col-span-2 row-span-1',
  '1x2': 'col-span-1 row-span-2',
  '2x2': 'col-span-2 row-span-2',
};

const POSITION_CLASSES: Record<GalleryTextPosition, string> = {
  'top-left': 'justify-start items-start text-left',
  'top-center': 'justify-start items-center text-center',
  'top-right': 'justify-start items-end text-right',
  'bottom-left': 'justify-end items-start text-left',
  'bottom-center': 'justify-end items-center text-center',
  'bottom-right': 'justify-end items-end text-right',
};

function getAnimationClass(anim: GalleryTextAnimation): string {
  switch (anim) {
    case 'pulse':
      return 'anim-pulse-glow';
    case 'float':
      return 'anim-float-drift';
    case 'fadeUp':
      return 'anim-fade-up';
    case 'none':
    case 'marquee':
    default:
      return '';
  }
}

export const StudioGallery: React.FC<StudioGalleryProps> = ({
  state,
  brandName = 'BROTHERHOOD',
  onExploreClick,
  className,
}) => {
  const {
    layoutMode = 'all',
    titleLayout = 'tile-corner',
    textAnimation = 'fadeUp',
    kicker = 'Editorial Archive',
    headerTitle = 'Studio Gallery',
    headerDescription = 'Architectural silhouettes, heavyweight textures, and limited capsule studies captured on frame.',
    items = [],
  } = state;

  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const [visibleTiles, setVisibleTiles] = React.useState<Record<string, boolean>>({});
  const [activeTileId, setActiveTileId] = React.useState<string | null>(null);

  // Trigger entrance text animations when each tile scrolls into mobile/desktop viewport
  React.useEffect(() => {
    const container = gridRef.current;
    if (!container || typeof IntersectionObserver === 'undefined') {
      const allVisible: Record<string, boolean> = {};
      items.forEach((it) => {
        allVisible[it.id] = true;
      });
      setVisibleTiles(allVisible);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const tileId = entry.target.getAttribute('data-tile-id');
            if (tileId) {
              setVisibleTiles((prev) => (prev[tileId] ? prev : { ...prev, [tileId]: true }));
              observer.unobserve(entry.target);
            }
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -24px 0px' }
    );

    const tiles = container.querySelectorAll('article[data-tile-id]');
    tiles.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [items, layoutMode]);

  const gridClass = React.useMemo(() => {
    switch (layoutMode) {
      case 'compact':
        return 'grid-cols-2 md:grid-cols-4 auto-rows-[155px] md:auto-rows-[195px] gap-2.5 md:gap-3';
      case 'large':
        return 'grid-cols-1 md:grid-cols-2 auto-rows-[240px] md:auto-rows-[360px] gap-4';
      case 'minimal':
      case 'all':
      default:
        return 'grid-cols-2 md:grid-cols-4 auto-rows-[155px] md:auto-rows-[240px] gap-3 md:gap-4 grid-flow-dense';
    }
  }, [layoutMode]);

  const animClass = getAnimationClass(textAnimation);

  return (
    <section
      id="featured"
      style={{
        backgroundColor: 'var(--gallery-bg)',
        color: 'var(--gallery-text)',
      }}
      className={cn(
        'relative w-full py-16 md:py-24 px-5 sm:px-6 lg:px-12 overflow-hidden border-t border-b border-white/10',
        className
      )}
    >
      <div className="max-w-[1600px] mx-auto">
        {/* Editorial Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-6 border-b border-white/10">
          <div className="max-w-2xl space-y-2.5">
            <div
              style={{ color: 'var(--gallery-accent)' }}
              className="flex items-center gap-2 text-[10px] sm:text-xs font-black uppercase tracking-[0.3em]"
            >
              <span>{brandName}</span>
              <span aria-hidden="true">·</span>
              <span>{kicker}</span>
            </div>
            <h2
              style={{ fontFamily: 'Times New Roman, serif', fontStyle: 'italic' }}
              className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight leading-none"
            >
              {headerTitle}
            </h2>
            {headerDescription && (
              <p className="text-xs sm:text-sm text-white/70 leading-relaxed max-w-xl font-sans">
                {headerDescription}
              </p>
            )}
          </div>

          {onExploreClick && (
            <div className="shrink-0">
              <button
                type="button"
                onClick={onExploreClick}
                style={{ borderColor: 'rgba(245, 239, 230, 0.25)' }}
                className="inline-flex items-center gap-2 border px-5 py-2.5 text-[10px] sm:text-xs font-black uppercase tracking-[0.22em] hover:bg-white hover:text-black transition-colors rounded-none"
              >
                <span>Explore Shop</span>
                <ArrowUpRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Bento Grid */}
        {items.length === 0 ? (
          <div className="border border-white/10 bg-black/30 p-12 text-center">
            <p className="text-xs uppercase tracking-[0.25em] text-white/50">
              No gallery tiles configured. Add visuals from Admin Studio Gallery.
            </p>
          </div>
        ) : (
          <div ref={gridRef} className={cn('grid', gridClass)}>
            {items.map((item) => {
              const spanClass =
                layoutMode === 'compact' || layoutMode === 'large'
                  ? 'col-span-1 row-span-1'
                  : SIZE_CLASSES[item.size || '1x1'];

              const effectivePosClass =
                titleLayout === 'centered'
                  ? 'justify-center items-center text-center'
                  : titleLayout === 'top-band'
                  ? 'justify-start items-start text-left'
                  : titleLayout === 'editorial-serif'
                  ? 'justify-end items-start text-left'
                  : POSITION_CLASSES[item.textPosition || 'bottom-left'];

              const isTopAligned =
                titleLayout === 'top-band' ||
                (titleLayout === 'tile-corner' &&
                  (item.textPosition || 'bottom-left').startsWith('top'));

              const isCentered = titleLayout === 'centered';
              const isMinimal = layoutMode === 'minimal';
              const hasMedia = Boolean(item.image && item.image.trim().length > 0);
              const isVideo = inferMediaType(item.image, item.mediaType) === 'video';
              const isTileVisible = Boolean(visibleTiles[item.id]);
              const isActive = activeTileId === item.id;

              const headingStyleClass =
                titleLayout === 'editorial-serif'
                  ? 'text-base sm:text-2xl md:text-4xl font-serif italic font-semibold tracking-tight leading-[1.08] sm:leading-none text-balance'
                  : 'text-sm sm:text-2xl md:text-4xl font-extrabold uppercase tracking-tight leading-[1.08] sm:leading-none font-sans text-balance';

              return (
                <article
                  key={item.id}
                  data-tile-id={item.id}
                  onClick={() => setActiveTileId((prev) => (prev === item.id ? null : item.id))}
                  className={cn(
                    'group relative overflow-hidden rounded-none bg-[#1e191c] border border-white/10 select-none cursor-pointer touch-manipulation',
                    spanClass
                  )}
                >
                  {/* Photography, Ambient Video, or Empty Guard Surface */}
                  {hasMedia ? (
                    isVideo ? (
                      <ResolvedVideo
                        src={item.image}
                        autoPlay
                        loop
                        muted
                        playsInline
                        aria-label={item.title || 'Studio campaign video'}
                        className={cn(
                          'absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105',
                          isActive && 'scale-105'
                        )}
                      />
                    ) : (
                      <ResolvedImage
                        src={item.image}
                        alt={item.title || 'Studio look'}
                        skeleton="dark"
                        className={cn(
                          'absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105',
                          isActive && 'scale-105'
                        )}
                      />
                    )
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#231d20] to-[#120f10] text-white/30 gap-2">
                      <ImageIcon size={24} strokeWidth={1.5} />
                      <span className="text-[10px] font-bold uppercase tracking-[0.25em]">
                        Awaiting Visual
                      </span>
                    </div>
                  )}

                  {/* Contrast Scrim — always visible on mobile touchscreens so text stays legible without hover */}
                  <div
                    className={cn(
                      'absolute inset-0 pointer-events-none transition-opacity duration-300',
                      isMinimal
                        ? isActive
                          ? 'opacity-100'
                          : 'opacity-85 md:opacity-0 md:group-hover:opacity-100 [@media(hover:none)]:opacity-85'
                        : 'opacity-100'
                    )}
                    style={{
                      background: isCentered
                        ? 'radial-gradient(circle at center, var(--gallery-scrim) 0%, rgba(20,17,19,0.42) 72%)'
                        : isTopAligned
                        ? 'linear-gradient(to bottom, var(--gallery-scrim) 0%, transparent 78%)'
                        : 'linear-gradient(to top, var(--gallery-scrim) 0%, transparent 78%)',
                    }}
                  />

                  {/* Overlapping Editorial Typography — optimized for mobile touch & viewport motion */}
                  <div
                    className={cn(
                      'relative z-10 h-full w-full p-3 sm:p-6 flex flex-col transition-all duration-300 ease-out',
                      effectivePosClass,
                      isMinimal
                        ? isActive
                          ? 'opacity-100'
                          : 'opacity-100 md:opacity-0 md:group-hover:opacity-100 [@media(hover:none)]:opacity-100'
                        : 'opacity-100',
                      !isTileVisible && textAnimation === 'fadeUp' ? 'opacity-0 translate-y-3' : ''
                    )}
                  >
                    <div
                      key={`${item.id}-${textAnimation}-${titleLayout}`}
                      className={cn(
                        'w-full transition-transform duration-300 ease-out group-hover:-translate-y-0.5',
                        effectivePosClass.includes('items-center')
                          ? 'origin-center'
                          : effectivePosClass.includes('items-end')
                          ? 'origin-right'
                          : 'origin-left',
                        textAnimation === 'marquee' ? 'overflow-hidden' : 'overflow-visible',
                        isActive && '-translate-y-0.5 scale-[1.03]',
                        isTileVisible ? animClass : ''
                      )}
                    >
                      {item.subtitle && (
                        <p
                          style={{ color: 'var(--gallery-accent)' }}
                          className="text-[9px] sm:text-xs font-bold uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-1 sm:mb-1.5 truncate [text-shadow:0_1px_8px_rgba(0,0,0,0.45)]"
                        >
                          {item.subtitle}
                        </p>
                      )}

                      {item.title && (
                        <h3
                          className={cn(
                            headingStyleClass,
                            '[text-shadow:0_2px_12px_rgba(0,0,0,0.5)]',
                            textAnimation === 'marquee' && 'overflow-hidden w-full'
                          )}
                        >
                          {textAnimation === 'marquee' ? (
                            <span className="marquee-fast gap-6 sm:gap-8">
                              <span className="whitespace-nowrap pr-6 sm:pr-8">{item.title}</span>
                              <span aria-hidden="true" className="whitespace-nowrap pr-6 sm:pr-8">
                                {item.title}
                              </span>
                            </span>
                          ) : (
                            item.title
                          )}
                        </h3>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
