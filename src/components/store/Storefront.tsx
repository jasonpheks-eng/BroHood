import React, { useState } from 'react';
import { Product, Settings, CreatorPost } from '../../types';
import { StoreProductCard } from '../common/StoreProductCard';
import { CreatorsClubSection } from '../creators/CreatorsClubSection';
import { ResolvedImage } from '../common/ResolvedMedia';
import { StudioGallery } from '../gallery/StudioGallery';
import { useStudioGalleryState } from '../../hooks/useStudioGalleryState';
import { Helmet } from '../common/Helmet';

interface StorefrontProps {
  settings: Settings;
  products: Product[];
  creatorPosts: CreatorPost[];
  onAddToCart: (product: Product, size?: string) => void;
  onQuickView: (product: Product) => void;
  onNavigateToShop: () => void;
  onSubmitPost: (post: Omit<CreatorPost, 'id' | 'createdAt'>) => Promise<void>;
}

export const Storefront: React.FC<StorefrontProps> = ({
  settings,
  products,
  creatorPosts,
  onAddToCart,
  onQuickView,
  onNavigateToShop,
  onSubmitPost,
}) => {
  const [legacySort, setLegacySort] = useState<'newest' | 'price-asc' | 'price-desc'>('newest');
  const { galleryState } = useStudioGalleryState('brotherhood_studio_gallery_v1', {
    cloudState: settings.studioGallery,
  });

  return (
    <div className="w-full max-w-full overflow-x-clip">
      <Helmet
        title={`${settings.brandName || 'BROTHERHOOD'} | Official Streetwear & Editorial Merch`}
        description={
          settings.aboutUsText
            ? settings.aboutUsText.slice(0, 155)
            : `Shop exclusive heavyweight silhouettes, streetwear capsules, and community creator collaborations from ${settings.brandName || 'BROTHERHOOD'}.`
        }
        ogType="website"
        ogImage={settings.heroImageUrl || settings.logoUrl || '/assets/aistudio/BRO_5917966d.png'}
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'ClothingStore',
          name: settings.brandName || 'BROTHERHOOD',
          description: 'Official streetwear, heavyweight garments, and limited collections.',
          currenciesAccepted: 'MWK',
          priceRange: 'MK',
        }}
      />

      {/* 2. Collection Section */}
      <section
        className="max-w-[1600px] mx-auto px-6 lg:px-12 py-16 w-full transition-colors duration-300"
        id="collection-section"
        style={{
          backgroundColor: settings.legacySectionBgColor || undefined,
          color: settings.legacySectionTextColor || undefined,
        }}
      >
        <div className="flex flex-col items-center justify-center mb-12 gap-4 text-center">
          <button
            onClick={onNavigateToShop}
            style={{ fontSize: '10px' }}
            className="bg-black text-white px-8 py-3.5 rounded-none font-black uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-md"
          >
            Explore the Shop
          </button>
          <h2
            className="text-[11px] font-black uppercase tracking-[0.2em] font-sans"
            style={{ color: settings.legacySectionTextColor || undefined }}
          >
            Shop {settings.brandName || 'BROTHERHOOD'} Collection
          </h2>
        </div>

        {/* Sort Bar */}
        <div className="flex justify-end items-center mb-6">
          <div className="flex items-center gap-4">
            <label className="text-[9px] font-black uppercase tracking-widest opacity-40">
              Sort
            </label>
            <select
              value={legacySort}
              onChange={(e) => setLegacySort(e.target.value as any)}
              className="bg-transparent border-b border-zinc-200 py-1 text-[9px] font-black uppercase tracking-widest focus:outline-none focus:border-black transition-all"
            >
              <option value="newest">Newest</option>
              <option value="price-asc">Price: Low-High</option>
              <option value="price-desc">Price: High-Low</option>
            </select>
          </div>
        </div>

        {/* Horizontal Snap Scroll Cards */}
        <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-12 gap-6 -mx-6 px-6 md:mx-0 md:px-0">
          {products
            .sort((a, b) => {
              if (legacySort === 'price-asc') return a.price - b.price;
              if (legacySort === 'price-desc') return b.price - a.price;
              return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
            })
            .map((product) => (
              <div key={product.id} className="min-w-[280px] md:min-w-[320px] snap-start">
                <StoreProductCard
                  product={product}
                  onAddToCart={onAddToCart}
                  onQuickView={onQuickView}
                />
              </div>
            ))}
        </div>
      </section>

      {/* 3. Creators Club Community Gallery Section */}
      <CreatorsClubSection
        settings={settings}
        products={products}
        creatorPosts={creatorPosts}
        onQuickView={onQuickView}
        onAddToCart={onAddToCart}
        onSubmitPost={onSubmitPost}
      />

      {/* 4. Studio Gallery Bento Section */}
      <StudioGallery
        state={galleryState}
        brandName={settings.brandName || 'BROTHERHOOD'}
        onExploreClick={onNavigateToShop}
      />

      {/* 5. About Us Section */}
      <section
        className="relative w-full bg-black text-white py-16 md:py-20 px-6 lg:px-12 overflow-hidden border-t border-zinc-900"
        style={{ backgroundColor: '#000000' }}
        id="editorial"
      >
        {settings.editorialImageUrl && (
          <ResolvedImage
            src={settings.editorialImageUrl}
            className="absolute inset-0 w-full h-full object-cover opacity-25 transition-all duration-300 pointer-events-none"
            alt={settings.aboutUsTitle || 'About Us'}
            style={{
              transform: `scale(${settings.editorialImageZoom || 1})`,
              objectPosition: settings.editorialImagePosition || '50% 50%',
            }}
          />
        )}

        <div className="relative z-10 max-w-[1600px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start border-t border-white/10 pt-10">
            <div className="lg:col-span-5 space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-white/50">
                <span>
                  <img
                    src="/assets/aistudio/Gemini_Generated_Image_h5y1jzh5y1jzh5y1_81796f08.jpeg"
                    alt={settings.brandName || 'BROTHERHOOD'}
                    style={{ height: '60px' }}
                    className="w-auto object-contain mix-blend-screen block"
                  />
                </span>
                <span aria-hidden="true">·</span>
                <span style={{ color: '#ffffff', width: '79.3359px', fontSize: '10px', display: 'inline-block' }}>About Us</span>
              </div>
              <h2 className="text-2xl md:text-4xl font-serif italic font-semibold tracking-tight text-white text-balance">
                {settings.aboutUsTitle || 'What Our Merch Means'}
              </h2>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-between gap-6">
              <p className="text-sm md:text-base text-white/75 leading-relaxed max-w-2xl whitespace-pre-line font-normal">
                {settings.aboutUsText ||
                  'Every piece in the Brotherhood collection is built to represent unity, resilience, and everyday purpose — heavyweight fabrics engineered to move with you and tell a story beyond apparel.'}
              </p>
              <div>
                <button
                  onClick={onNavigateToShop}
                  className="border border-white/25 text-white px-6 py-2.5 text-[10px] font-black tracking-[0.2em] uppercase hover:bg-white hover:text-black transition-colors rounded-none"
                >
                  Shop Collection
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
