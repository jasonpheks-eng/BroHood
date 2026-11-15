export interface EmbedVideoInfo {
  isEmbed: boolean;
  embedUrl: string;
  provider: 'streamable' | 'youtube' | 'vimeo' | 'iframe' | null;
  providerId?: string;
  canonicalUrl: string;
}

const STREAMABLE_RESERVED_PATHS = new Set([
  'about',
  'privacy',
  'terms',
  'login',
  'signup',
  'register',
  'pricing',
  'tools',
  'blog',
  'clipper',
  'support',
  'contact',
  'dashboard',
  'account',
  'settings',
  'api',
]);

const DIRECT_MEDIA_EXT_RE = /\.(mp4|m4v|mov|webm|ogv|3gp|mkv|avi|jpeg|jpg|gif|png|webp|svg|avif|bmp|heic|heif)($|\?|#)/i;

/**
 * Extracts a clean URL when a user pastes an HTML <iframe> embed snippet,
 * or trims standard URLs. Returns '' for malformed HTML without a valid src.
 */
export function normalizeMediaUrlInput(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Detect HTML embed snippets like <div ...><iframe ... src="https://streamable.com/e/zc5a37?autoplay=1" ...>
  if (trimmed.includes('<') && /<iframe[\s>]/i.test(trimmed)) {
    const srcMatch = trimmed.match(/<iframe[^>]*\ssrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const extracted = (srcMatch?.[1] || srcMatch?.[2] || srcMatch?.[3] || '').trim();
    if (extracted) {
      if (extracted.startsWith('//')) return `https:${extracted}`;
      return extracted;
    }
    return '';
  }

  // Reject raw HTML tags that don't carry an iframe src
  if (trimmed.startsWith('<')) {
    const genericSrcMatch = trimmed.match(/\ssrc\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
    const extracted = (genericSrcMatch?.[1] || genericSrcMatch?.[2] || '').trim();
    if (extracted) {
      return extracted.startsWith('//') ? `https:${extracted}` : extracted;
    }
    return '';
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  return trimmed;
}

export function getEmbedVideoInfo(
  rawUrl?: string,
  options: { loop?: boolean; muted?: boolean; autoplay?: boolean } = {}
): EmbedVideoInfo {
  const { loop = true, muted = true, autoplay = true } = options;
  const trimmed = (rawUrl || '').trim();
  const hadIframeTag = trimmed.includes('<') && /<iframe[\s>]/i.test(trimmed);
  const clean = normalizeMediaUrlInput(trimmed);

  if (!clean) {
    return { isEmbed: false, embedUrl: '', provider: null, canonicalUrl: '' };
  }

  const lower = clean.toLowerCase();
  if (
    lower.startsWith('idb://') ||
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('/uploads/') ||
    lower.startsWith('/assets/')
  ) {
    return { isEmbed: false, embedUrl: '', provider: null, canonicalUrl: clean };
  }

  try {
    const parsed = new URL(clean, 'https://placeholder.local');
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    // Direct CDN media file URLs (e.g. .mp4) should remain native <video> sources
    if (DIRECT_MEDIA_EXT_RE.test(pathname)) {
      return { isEmbed: false, embedUrl: '', provider: null, canonicalUrl: clean };
    }

    // 1. Streamable: streamable.com/zc5a37, streamable.com/e/zc5a37, streamable.com/o/zc5a37
    if ((host === 'streamable.com' || host.endsWith('.streamable.com')) && !host.startsWith('cdn')) {
      const match = pathname.match(/^\/(?:(?:e|o|s|m)\/)?([a-zA-Z0-9_-]{3,20})\/?$/);
      const id = match?.[1];
      if (id && !STREAMABLE_RESERVED_PATHS.has(id.toLowerCase())) {
        const params = new URLSearchParams();
        if (autoplay) params.set('autoplay', '1');
        if (muted) params.set('muted', '1');
        params.set('nocontrols', '1');
        params.set('loop', loop ? '1' : '0');
        return {
          isEmbed: true,
          embedUrl: `https://streamable.com/e/${id}?${params.toString()}`,
          provider: 'streamable',
          providerId: id,
          canonicalUrl: clean,
        };
      }
    }

    // 2. YouTube: youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/..., youtube.com/embed/...
    if (
      host === 'youtu.be' ||
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'youtube-nocookie.com' ||
      host.endsWith('.youtube-nocookie.com')
    ) {
      let id = '';
      if (host === 'youtu.be') {
        id = pathname.replace(/^\/+/, '').split('/')[0] || '';
      } else if (pathname.startsWith('/embed/')) {
        id = pathname.replace('/embed/', '').split('/')[0] || '';
      } else if (pathname.startsWith('/shorts/')) {
        id = pathname.replace('/shorts/', '').split('/')[0] || '';
      } else {
        id = parsed.searchParams.get('v') || '';
      }

      if (id) {
        const params = new URLSearchParams({
          autoplay: autoplay ? '1' : '0',
          mute: muted ? '1' : '0',
          controls: '0',
          playsinline: '1',
          rel: '0',
          modestbranding: '1',
        });
        if (loop) {
          params.set('loop', '1');
          params.set('playlist', id);
        }
        return {
          isEmbed: true,
          embedUrl: `https://www.youtube.com/embed/${id}?${params.toString()}`,
          provider: 'youtube',
          providerId: id,
          canonicalUrl: clean,
        };
      }
    }

    // 3. Vimeo: vimeo.com/123456 or player.vimeo.com/video/123456
    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
      const vimeoMatch = pathname.match(/(?:\/video)?\/(\d+)(?:\/|$)/);
      const id = vimeoMatch?.[1];
      if (id) {
        const params = new URLSearchParams({
          autoplay: autoplay ? '1' : '0',
          muted: muted ? '1' : '0',
          background: '1',
          controls: '0',
          loop: loop ? '1' : '0',
        });
        return {
          isEmbed: true,
          embedUrl: `https://player.vimeo.com/video/${id}?${params.toString()}`,
          provider: 'vimeo',
          providerId: id,
          canonicalUrl: clean,
        };
      }
    }

    // 4. Generic <iframe> embed snippet pasted by user
    if (hadIframeTag && (clean.startsWith('https://') || clean.startsWith('http://'))) {
      return {
        isEmbed: true,
        embedUrl: clean,
        provider: 'iframe',
        canonicalUrl: clean,
      };
    }
  } catch {
    if (hadIframeTag && (clean.startsWith('https://') || clean.startsWith('http://'))) {
      return {
        isEmbed: true,
        embedUrl: clean,
        provider: 'iframe',
        canonicalUrl: clean,
      };
    }
  }

  return { isEmbed: false, embedUrl: '', provider: null, canonicalUrl: clean };
}

export function normalizeHeroMediaList(urls: string[]): string[] {
  const seenKeys = new Set<string>();
  const result: string[] = [];

  for (const raw of urls) {
    const clean = normalizeMediaUrlInput(raw);
    if (!clean) continue;

    const embedInfo = getEmbedVideoInfo(clean);
    const dedupKey =
      embedInfo.isEmbed && embedInfo.provider && embedInfo.providerId
        ? `embed:${embedInfo.provider}:${embedInfo.providerId}`
        : clean;

    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);
    result.push(clean);
  }

  return result;
}
