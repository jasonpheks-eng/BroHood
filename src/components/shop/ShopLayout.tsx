import React, { useState, useMemo } from 'react';
import { Search, SlidersHorizontal, ArrowLeft } from 'lucide-react';
import { Product, Settings } from '../../types';
import { StoreProductCard } from '../common/StoreProductCard';
import { Helmet } from '../common/Helmet';

interface ShopLayoutProps {
  products: Product[];
  settings: Settings;
  onAddToCart: (product: Product, size?: string) => void;
  onQuickView: (product: Product) => void;
  onBackToHome: () => void;
}

const STANDARD_CATEGORIES = [
  'CAPS',
  'LONG SLEEVES',
  'SHIRTS',
  'SHORTS',
  'HOODIES',
  'PANTS',
  'JACKETS',
  'ACCESSORIES',
];

export const ShopLayout: React.FC<ShopLayoutProps> = ({
  products,
  settings,
  onAddToCart,
  onQuickView,
  onBackToHome,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'price-asc' | 'price-desc'>('newest');
  const [searchQuery, setSearchQuery] = useState('');

  // Extract all available categories from products + standard list
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    STANDARD_CATEGORIES.forEach((c) => set.add(c.toUpperCase()));
    products.forEach((p) => {
      if (p.category) set.add(p.category.toUpperCase());
    });
    return Array.from(set).sort();
  }, [products]);

  // Filter & sort products
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        // Category filter
        if (selectedCategory !== 'all') {
          if (p.category.toUpperCase() !== selectedCategory.toUpperCase()) return false;
        }
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = p.name.toLowerCase().includes(q);
          const matchCat = p.category.toLowerCase().includes(q);
          if (!matchName && !matchCat) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'price-asc') return a.price - b.price;
        if (sortBy === 'price-desc') return b.price - a.price;
        return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      });
  }, [products, selectedCategory, sortBy, searchQuery]);

  return (
    <div className="w-full bg-white text-black min-h-screen py-10">
      <Helmet
        title={`Shop All Garments | ${settings.brandName || 'BROTHERHOOD'} Catalog`}
        description={`Explore the full catalog of ${filteredProducts.length} streetwear garments, hoodies, and accessories in Malawi Kwacha (MK).`}
        ogType="website"
        ogImage={settings.heroImageUrl || settings.logoUrl || '/assets/aistudio/BRO_5917966d.png'}
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: `All Garments – ${settings.brandName || 'BROTHERHOOD'}`,
          description: 'Browse the complete fashion catalog and limited edition drops.',
          numberOfItems: filteredProducts.length,
        }}
      />
      <div className="max-w-[1600px] mx-auto px-6 lg:px-12">
        {/* Navigation & Breadcrumb */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-zinc-200">
          <button
            onClick={onBackToHome}
            className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-black transition-colors"
          >
            <ArrowLeft size={14} /> Back to Storefront
          </button>
          <div className="text-[10px] font-mono text-zinc-400 tabular-nums uppercase tracking-widest">
            {filteredProducts.length} Items Available
          </div>
        </div>

        {/* Title Header */}
        <div className="text-center mb-12 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">
            {settings.brandName || 'BROTHERHOOD'} Catalog
          </p>
          <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight">
            Complete Garment Collection
          </h1>
        </div>

        {/* Filter & Toolbar */}
        <div className="mb-12 pb-6 border-b border-zinc-200 space-y-5">
          {/* Row 1: Search, Collection Switcher & Sort */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-grow max-w-md">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search garments by name or fabric..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-zinc-50/70 border border-zinc-200 text-xs tracking-wide text-black placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:border-black transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:text-black px-1"
                  aria-label="Clear search"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center justify-end">
              <div className="flex items-center gap-2.5 border-b border-zinc-200 pb-1">
                <label className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400 whitespace-nowrap">
                  Sort
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'newest' | 'price-asc' | 'price-desc')}
                  className="bg-transparent py-1 pr-2 text-[11px] font-black uppercase tracking-wider text-black focus:outline-none cursor-pointer"
                >
                  <option value="newest">Newest</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                </select>
              </div>
            </div>
          </div>

          {/* Row 2: Interactive Category Filter Strip */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] border whitespace-nowrap shrink-0 transition-all ${
                  selectedCategory === 'all'
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:border-black hover:text-black'
                }`}
              >
                All Categories
              </button>
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] border whitespace-nowrap shrink-0 transition-all ${
                    selectedCategory === cat
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-zinc-600 border-zinc-200 hover:border-black hover:text-black'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {(selectedCategory !== 'all' || searchQuery.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setSearchQuery('');
                }}
                className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 hover:text-black underline underline-offset-4 whitespace-nowrap shrink-0"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-zinc-200 space-y-4">
            <SlidersHorizontal size={36} className="mx-auto text-zinc-300" />
            <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
              No garments found matching your selected criteria.
            </p>
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSearchQuery('');
              }}
              className="bg-black text-white px-6 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8">
            {filteredProducts.map((product) => (
              <StoreProductCard
                key={product.id}
                product={product}
                onAddToCart={onAddToCart}
                onQuickView={onQuickView}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
