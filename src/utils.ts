import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { SocialLinkItem } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number): string {
  return `MK ${Number(price).toFixed(2)}`;
}

export function getDefaultSocialLinks(brandName?: string): SocialLinkItem[] {
  const handleSlug = (brandName || 'brotherhood')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') || 'brotherhood';

  return [
    {
      id: 'social-instagram',
      platform: 'Instagram',
      tag: `@${handleSlug}`,
      url: `https://instagram.com/${handleSlug}`,
    },
    {
      id: 'social-tiktok',
      platform: 'TikTok',
      tag: `@${handleSlug}`,
      url: `https://tiktok.com/@${handleSlug}`,
    },
    {
      id: 'social-x',
      platform: 'X',
      tag: `@${handleSlug}`,
      url: `https://x.com/${handleSlug}`,
    },
    {
      id: 'social-youtube',
      platform: 'YouTube',
      tag: `@${handleSlug}`,
      url: `https://youtube.com/@${handleSlug}`,
    },
  ];
}

export function normalizeExternalUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function formatWhatsAppDigits(rawNumber?: string): string {
  if (!rawNumber) return '';
  return rawNumber.replace(/[^\d]/g, '');
}
