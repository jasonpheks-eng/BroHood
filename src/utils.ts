import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Settings, SocialLinkItem } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number): string {
  return `MK ${Number(price).toFixed(2)}`;
}

export function getDefaultSocialLinks(brandName?: string): SocialLinkItem[] {
  const handleSlug =
    (brandName || 'brotherhood')
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
  let input = rawNumber.trim();
  if (!input) return '';

  // Support pasted wa.me/<digits> or api.whatsapp.com/send?phone=<digits>
  const phoneParamMatch = input.match(/[?&]phone=([^&]+)/i);
  if (phoneParamMatch?.[1]) {
    input = decodeURIComponent(phoneParamMatch[1]);
  } else if (/wa\.me\//i.test(input)) {
    const waMatch = input.match(/wa\.me\/([^/?#]+)/i);
    if (waMatch?.[1]) input = waMatch[1];
  }

  let digits = input.replace(/[^\d]/g, '');
  if (!digits) return '';

  // Strip international 00 prefix (e.g. 00265999... -> 265999...)
  if (digits.startsWith('00')) {
    digits = digits.replace(/^00+/, '');
  }

  return digits;
}

export function resolveStoreWhatsAppDigits(settings?: Partial<Settings>): string {
  if (!settings) return '';
  const primary = formatWhatsAppDigits(settings.whatsappNumber);
  if (primary) return primary;

  const socialLinks = settings.socialLinks || [];
  for (const item of socialLinks) {
    const label = `${item.platform || ''} ${item.url || ''}`.toLowerCase();
    if (label.includes('whatsapp') || label.includes('wa.me')) {
      const fromUrl = formatWhatsAppDigits(item.url);
      if (fromUrl) return fromUrl;
      const fromTag = formatWhatsAppDigits(item.tag);
      if (fromTag) return fromTag;
    }
  }
  return '';
}

export function buildWhatsAppDirectUrl(digits: string, message: string): string {
  const cleanDigits = formatWhatsAppDigits(digits);
  if (!cleanDigits) return '';
  return `https://api.whatsapp.com/send?phone=${cleanDigits}&text=${encodeURIComponent(message)}`;
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function compressImageForCrossDevice(
  fileOrDataUrl: File | string,
  maxBytes: number = 155000
): Promise<string> {
  const rawDataUrl =
    typeof fileOrDataUrl === 'string'
      ? fileOrDataUrl
      : await readFileAsDataUrl(fileOrDataUrl);

  if (
    typeof document === 'undefined' ||
    rawDataUrl.startsWith('data:image/svg+xml') ||
    (!rawDataUrl.startsWith('data:image/') && typeof fileOrDataUrl === 'string')
  ) {
    return rawDataUrl;
  }

  if (rawDataUrl.length <= maxBytes) {
    return rawDataUrl;
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const attempts: Array<{ maxDim: number; quality: number }> = [
          { maxDim: 1200, quality: 0.82 },
          { maxDim: 960, quality: 0.72 },
          { maxDim: 760, quality: 0.62 },
          { maxDim: 600, quality: 0.52 },
          { maxDim: 480, quality: 0.44 },
        ];

        let best = rawDataUrl;
        for (const attempt of attempts) {
          let { width, height } = img;
          if (width > attempt.maxDim || height > attempt.maxDim) {
            const ratio = Math.min(attempt.maxDim / width, attempt.maxDim / height);
            width = Math.max(1, Math.round(width * ratio));
            height = Math.max(1, Math.round(height * ratio));
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) break;
          ctx.drawImage(img, 0, 0, width, height);
          const candidate = canvas.toDataURL('image/jpeg', attempt.quality);
          if (candidate.length < best.length) {
            best = candidate;
          }
          if (candidate.length <= maxBytes) {
            resolve(candidate);
            return;
          }
        }
        resolve(best);
      } catch {
        resolve(rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}
