import React from 'react';
import { ShoppingBag, Settings as SettingsIcon, Menu, X } from 'lucide-react';
import { Settings } from '../../types';
import { ResolvedImage } from './ResolvedMedia';

interface NavbarProps {
  settings: Settings;
  cartCount: number;
  onOpenCart: () => void;
  activeView: 'store' | 'shop' | 'admin';
  onChangeView: (view: 'store' | 'shop' | 'admin') => void;
  onScrollToSection?: (sectionId: string) => void;
  onRequireAdminAuth?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  settings,
  cartCount,
  onOpenCart,
  activeView,
  onChangeView,
  onScrollToSection,
  onRequireAdminAuth,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const handleNavClick = (target: string) => {
    setMobileMenuOpen(false);
    if (target === 'shop') {
      onChangeView('shop');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (target === 'admin') {
      if (activeView === 'admin') {
        onChangeView('store');
        return;
      }
      try {
        sessionStorage.removeItem('brotherhood_admin_unlocked');
        localStorage.removeItem('brotherhood_admin_unlocked');
      } catch {}
      if (onRequireAdminAuth) {
        onRequireAdminAuth();
      }
    } else if (target === 'store') {
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      onChangeView('store');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Return to store and scroll to section
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      if (activeView !== 'store') {
        onChangeView('store');
        setTimeout(() => {
          if (onScrollToSection) onScrollToSection(target);
        }, 100);
      } else {
        if (onScrollToSection) onScrollToSection(target);
      }
    }
  };

  return (
    <header className="sticky top-0 z-[120] bg-white/95 backdrop-blur-md border-b border-zinc-200">
      <div
        className="max-w-[1600px] mx-auto px-6 lg:px-12 h-20 flex items-center justify-between gap-8"
        style={{ backgroundColor: '#ffffff' }}
      >
        {/* Zone 1: Brand Wordmark */}
        <button
          onClick={() => handleNavClick('store')}
          className="text-xl md:text-2xl font-black uppercase tracking-[0.25em] text-black whitespace-nowrap shrink-0 hover:opacity-80 transition-opacity flex items-center gap-3 text-left p-0 m-0"
        >
          {settings.logoUrl ? (
            <ResolvedImage
              src={settings.logoUrl}
              alt={settings.brandName || 'Brand'}
              style={{
                height: '51px',
                paddingLeft: '0px',
                paddingRight: '0px',
                paddingBottom: '0px',
                marginLeft: '0px',
              }}
              className="w-auto max-w-[240px] object-contain block"
            />
          ) : (
            <span>{settings.brandName || 'BROTHERHOOD'}</span>
          )}
        </button>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-600">
          <button
            onClick={() => handleNavClick('collection-section')}
            className="hover:text-black transition-colors whitespace-nowrap shrink-0 hover:underline underline-offset-8"
          >
            Collection
          </button>
          <button
            onClick={() => handleNavClick('shop')}
            className={`hover:text-black transition-colors whitespace-nowrap shrink-0 hover:underline underline-offset-8 ${
              activeView === 'shop' ? 'text-black underline underline-offset-8 font-black' : ''
            }`}
          >
            Shop All
          </button>
          <button
            onClick={() => handleNavClick('lookbook-section')}
            className="hover:text-black transition-colors whitespace-nowrap shrink-0 hover:underline underline-offset-8"
          >
            Creators Club
          </button>
          <button
            onClick={() => handleNavClick('featured')}
            className="hover:text-black transition-colors whitespace-nowrap shrink-0 hover:underline underline-offset-8"
          >
            Gallery
          </button>
        </nav>

        {/* Zone 3: Primary Action & Controls */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => handleNavClick(activeView === 'admin' ? 'store' : 'admin')}
            title="Admin Console"
            className={`p-2.5 text-zinc-500 hover:text-black hover:bg-zinc-100 transition-colors rounded-none ${
              activeView === 'admin' ? 'text-black bg-zinc-100' : ''
            }`}
            aria-label="Admin Settings"
          >
            <SettingsIcon size={18} />
          </button>

          <button
            onClick={onOpenCart}
            className="bg-black text-white px-5 py-2.5 rounded-none text-[11px] font-black uppercase tracking-[0.18em] flex items-center gap-2.5 hover:bg-zinc-800 transition-all shadow-sm shrink-0"
            aria-label={`Shopping Bag, ${cartCount} items`}
          >
            <ShoppingBag size={15} />
            <span className="hidden sm:inline">Bag</span>
            <span className="font-mono tabular-nums bg-white text-black text-[10px] font-bold px-1.5 py-0.2 min-w-[18px] text-center">
              {cartCount}
            </span>
          </button>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-black hover:bg-zinc-100 transition-colors"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-200 bg-white px-6 py-6 space-y-4">
          <div className="flex flex-col gap-4 text-xs font-black uppercase tracking-widest text-zinc-700">
            <button
              onClick={() => handleNavClick('collection-section')}
              className="text-left py-2 hover:text-black border-b border-zinc-100"
            >
              Collection
            </button>
            <button
              onClick={() => handleNavClick('shop')}
              className="text-left py-2 hover:text-black border-b border-zinc-100"
            >
              Shop All
            </button>
            <button
              onClick={() => handleNavClick('lookbook-section')}
              className="text-left py-2 hover:text-black border-b border-zinc-100"
            >
              Creators Club
            </button>
            <button
              onClick={() => handleNavClick('featured')}
              className="text-left py-2 hover:text-black border-b border-zinc-100"
            >
              Gallery
            </button>
            <button
              onClick={() => handleNavClick('admin')}
              className="text-left py-2 text-zinc-400 hover:text-black"
            >
              Admin Management
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
