import React from 'react';
import { Instagram, Youtube, Globe, MessageCircle, Facebook } from 'lucide-react';
import { Settings } from '../../types';
import { ResolvedImage } from './ResolvedMedia';
import { getDefaultSocialLinks, normalizeExternalUrl } from '../../utils';

interface FooterProps {
  settings: Settings;
  onNavigate: (view: 'store' | 'shop') => void;
}

const renderSocialIcon = (platform: string, url: string = '') => {
  const key = `${platform} ${url}`.trim().toLowerCase();
  if (key.includes('instagram') || key === 'ig') {
    return <Instagram size={17} aria-hidden="true" />;
  }
  if (key.includes('tiktok')) {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
      </svg>
    );
  }
  if (platform.trim().toLowerCase() === 'x' || key.includes('x.com') || key.includes('twitter')) {
    return (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }
  if (key.includes('youtube') || key.includes('youtu.be') || key === 'yt') {
    return <Youtube size={18} aria-hidden="true" />;
  }
  if (key.includes('whatsapp') || key.includes('wa.me')) {
    return <MessageCircle size={17} aria-hidden="true" />;
  }
  if (key.includes('facebook') || key.includes('fb.com') || key === 'fb') {
    return <Facebook size={17} aria-hidden="true" />;
  }
  return <Globe size={17} aria-hidden="true" />;
};

export const Footer: React.FC<FooterProps> = ({ settings, onNavigate }) => {
  const socialTags =
    settings.socialLinks !== undefined
      ? settings.socialLinks
      : getDefaultSocialLinks(settings.brandName);

  return (
    <footer className="relative w-full bg-[#000000] text-white py-8 px-6 lg:px-12 border-t border-zinc-900 overflow-hidden">
      {/* Background Graphic if configured */}
      {settings.footerImageUrl && (
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
          <ResolvedImage
            src={settings.footerImageUrl}
            alt="Footer Background"
            className="w-full h-full object-cover"
            style={{
              transform: `scale(${settings.footerImageZoom || 1})`,
              objectPosition: settings.footerImagePosition || '50% 50%',
            }}
          />
        </div>
      )}

      <div className="relative z-10 max-w-[1600px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
        {/* Brand Logo */}
        <button
          type="button"
          onClick={() => {
            onNavigate('store');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex items-center hover:opacity-85 transition-opacity shrink-0"
          aria-label={settings.brandName || 'BROTHERHOOD'}
        >
          <img
            src="/assets/aistudio/Gemini_Generated_Image_h5y1jzh5y1jzh5y1_81796f08.jpeg"
            alt={settings.brandName || 'BROTHERHOOD'}
            className="h-10 md:h-12 w-auto object-contain mix-blend-screen block"
          />
        </button>

        {/* Social Media Icons Only */}
        {socialTags.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {socialTags.map((social) => {
              const href = normalizeExternalUrl(social.url || '');
              const label = social.platform || 'Social';
              const tag = social.tag || '';
              const titleText = tag ? `${label} (${tag})` : label;

              return href ? (
                <a
                  key={social.id}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={titleText}
                  aria-label={titleText}
                  className="inline-flex items-center justify-center w-9 h-9 border border-white/10 bg-white/5 text-white/75 hover:text-white hover:border-white/40 hover:bg-white/10 transition-all"
                >
                  {renderSocialIcon(label, social.url)}
                </a>
              ) : (
                <span
                  key={social.id}
                  title={titleText}
                  aria-label={titleText}
                  className="inline-flex items-center justify-center w-9 h-9 border border-white/10 bg-white/5 text-white/45"
                >
                  {renderSocialIcon(label, social.url)}
                </span>
              );
            })}
          </div>
        )}

        {/* Copyright */}
        <div className="text-white/40 text-center md:text-right shrink-0">
          © {new Date().getFullYear()} {settings.brandName || 'BROTHERHOOD'}. All rights reserved.
        </div>
      </div>
    </footer>
  );
};
