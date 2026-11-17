import React from 'react';
import { cn } from '../../utils';

export interface MediaSkeletonProps {
  variant?: 'light' | 'dark';
  className?: string;
}

/**
 * Clean architectural loading surface for buffering images & ambient videos.
 * Never renders play icons or decorative controls.
 */
export const MediaSkeleton: React.FC<MediaSkeletonProps> = ({
  variant = 'light',
  className,
}) => {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'w-full h-full pointer-events-none select-none',
        variant === 'dark' ? 'skeleton-shimmer-dark' : 'skeleton-shimmer',
        className
      )}
    />
  );
};

export const ProductCardSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex flex-col h-full bg-white border border-zinc-200/80 rounded-none',
        className
      )}
    >
      {/* Garment Image Stage */}
      <div className="relative aspect-[3/4] w-full overflow-hidden border-b border-zinc-100">
        <MediaSkeleton variant="light" />
      </div>

      {/* Product Information Bars */}
      <div className="px-4 pt-4 pb-4 flex flex-col flex-grow justify-between bg-white">
        <div className="space-y-2.5">
          {/* Category Label */}
          <div className="h-2.5 w-16 skeleton-shimmer rounded-none" />
          {/* Title Lines */}
          <div className="space-y-1.5">
            <div className="h-3.5 w-5/6 skeleton-shimmer rounded-none" />
            <div className="h-3.5 w-2/3 skeleton-shimmer rounded-none" />
          </div>
        </div>

        {/* Footer Price + Action */}
        <div className="flex items-center justify-between pt-3 border-t border-zinc-100 mt-4">
          <div className="h-3.5 w-20 skeleton-shimmer rounded-none" />
          <div className="h-7 w-20 skeleton-shimmer rounded-none" />
        </div>
      </div>
    </div>
  );
};

export const ProductGridSkeleton: React.FC<{
  count?: number;
  className?: string;
}> = ({ count = 8, className }) => {
  return (
    <div
      aria-busy="true"
      aria-label="Loading garments"
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8',
        className
      )}
    >
      {Array.from({ length: count }).map((_, idx) => (
        <ProductCardSkeleton key={idx} />
      ))}
    </div>
  );
};

export const StudioGallerySkeleton: React.FC = () => {
  return (
    <section
      aria-hidden="true"
      style={{ backgroundColor: 'var(--gallery-bg, #141113)' }}
      className="relative w-full py-16 md:py-24 px-5 sm:px-6 lg:px-12 overflow-hidden border-t border-b border-white/10"
    >
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-6 border-b border-white/10">
          <div className="max-w-2xl space-y-3">
            <div className="h-3 w-40 skeleton-shimmer-dark" />
            <div className="h-8 w-64 skeleton-shimmer-dark" />
            <div className="h-3.5 w-80 max-w-full skeleton-shimmer-dark" />
          </div>
          <div className="h-9 w-36 skeleton-shimmer-dark border border-white/10" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 auto-rows-[155px] md:auto-rows-[240px] gap-3 md:gap-4 grid-flow-dense">
          <div className="col-span-2 row-span-2 skeleton-shimmer-dark border border-white/10" />
          <div className="col-span-1 row-span-1 skeleton-shimmer-dark border border-white/10" />
          <div className="col-span-1 row-span-1 skeleton-shimmer-dark border border-white/10" />
          <div className="col-span-2 row-span-1 skeleton-shimmer-dark border border-white/10" />
        </div>
      </div>
    </section>
  );
};

export const StorefrontPageSkeleton: React.FC = () => {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading storefront"
      className="min-h-screen w-full max-w-full overflow-x-clip flex flex-col bg-white text-black antialiased"
    >
      <span className="sr-only">Loading BrotherHood storefront...</span>

      {/* Sticky Navbar Skeleton */}
      <header className="sticky top-0 z-[120] bg-white/95 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-12 h-20 flex items-center justify-between gap-8">
          <div className="h-7 w-40 sm:w-48 skeleton-shimmer" />
          <div className="hidden md:flex items-center gap-8">
            <div className="h-3 w-20 skeleton-shimmer" />
            <div className="h-3 w-16 skeleton-shimmer" />
            <div className="h-3 w-24 skeleton-shimmer" />
            <div className="h-3 w-20 skeleton-shimmer" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-7 w-16 skeleton-shimmer" />
            <div className="h-7 w-7 skeleton-shimmer" />
          </div>
        </div>
      </header>

      {/* Hero Video Banner Skeleton (zero play button) */}
      <section className="relative w-full aspect-[4/3] sm:aspect-[16/9] md:aspect-[21/9] min-h-[260px] sm:min-h-[380px] md:min-h-[480px] overflow-hidden border-b border-zinc-100">
        <MediaSkeleton variant="light" />
      </section>

      {/* Collection Carousel Section Skeleton */}
      <section className="max-w-[1600px] mx-auto px-6 lg:px-12 py-16 w-full bg-white">
        <div className="flex flex-col items-center justify-center mb-12 gap-4">
          <div className="h-10 w-44 skeleton-shimmer" />
          <div className="h-3 w-56 skeleton-shimmer" />
        </div>

        <div className="flex justify-end items-center mb-6">
          <div className="h-4 w-28 skeleton-shimmer" />
        </div>

        <div className="flex overflow-hidden pb-12 gap-6 -mx-6 px-6 md:mx-0 md:px-0">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="min-w-[280px] md:min-w-[320px] shrink-0">
              <ProductCardSkeleton />
            </div>
          ))}
        </div>
      </section>

      {/* Studio Gallery Bento Skeleton */}
      <StudioGallerySkeleton />
    </div>
  );
};
