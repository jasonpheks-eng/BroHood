import { supabase } from './supabase';
import { Product, Settings, CreatorPost, StudioGalleryState } from './types';
import { compressImageForCrossDevice, readFileAsDataUrl } from './utils';

export interface MediaUploadResult {
  url: string;
  source: 'supabase' | 'server' | 'inline' | 'external';
  error?: string;
}

async function uploadToLocalMediaServer(blob: Blob, fileName: string): Promise<string> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'media';
  const resp = await fetch('/api/upload-media', {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(safeName),
    },
    body: blob,
  });
  if (!resp.ok) return '';
  const data = (await resp.json()) as { url?: string };
  return data?.url || '';
}

export async function uploadMediaToSupabase(
  fileOrDataUrl: string | File,
  fileName: string = 'media'
): Promise<MediaUploadResult> {
  try {
    let blob: Blob;
    let resolvedName = fileName;
    let isImage = false;
    let isVideo = false;

    if (typeof fileOrDataUrl === 'string') {
      if (!fileOrDataUrl.startsWith('data:')) {
        return { url: fileOrDataUrl, source: 'external' };
      }
      isImage = fileOrDataUrl.startsWith('data:image/');
      isVideo = fileOrDataUrl.startsWith('data:video/');
      const res = await fetch(fileOrDataUrl);
      blob = await res.blob();
    } else {
      blob = fileOrDataUrl;
      resolvedName = fileOrDataUrl.name || fileName;
      isImage = fileOrDataUrl.type.startsWith('image/');
      isVideo = fileOrDataUrl.type.startsWith('video/');
    }

    const safeName = resolvedName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `uploads/${Date.now()}_${safeName}`;
    const contentType =
      blob.type ||
      (isVideo ? 'video/mp4' : isImage ? 'image/jpeg' : 'application/octet-stream');

    // For videos: try local app media server (/api/upload-media) first
    if (isVideo) {
      try {
        const serverUrl = await uploadToLocalMediaServer(blob, safeName);
        if (serverUrl) {
          return { url: serverUrl, source: 'server' };
        }
      } catch (e) {
        console.warn('Local media server upload notice:', e);
      }
    }

    const { data, error } = await supabase.storage.from('media').upload(filePath, blob, {
      contentType,
      upsert: true,
    });

    if (!error && data?.path) {
      const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(data.path);
      if (publicUrlData?.publicUrl) {
        return { url: publicUrlData.publicUrl, source: 'supabase' };
      }
    }

    if (error) {
      console.warn('Supabase storage upload notice:', error.message);
    }

    // For images: compress into a compact JPEG data URL for cross-device Firestore/Supabase sync,
    // or fall back to Express /api/upload-media if still large.
    if (isImage) {
      const compressed = await compressImageForCrossDevice(fileOrDataUrl, 155000);
      if (compressed && compressed.length <= 195000) {
        return { url: compressed, source: 'inline' };
      }
      const serverUrl = await uploadToLocalMediaServer(blob, safeName);
      if (serverUrl) {
        return { url: serverUrl, source: 'server' };
      }
      return {
        url: '',
        source: 'inline',
        error: 'Image is too large after compression. Please upload a smaller image or create the "media" bucket in Supabase.',
      };
    }

    // For videos: try server upload if Supabase storage failed
    if (isVideo) {
      const serverUrl = await uploadToLocalMediaServer(blob, safeName);
      if (serverUrl) {
        return { url: serverUrl, source: 'server' };
      }
      return {
        url: '',
        source: 'supabase',
        error:
          error?.message ||
          'Video upload failed. Please try an MP4 under 150MB or paste an HTTPS .mp4 link.',
      };
    }

    const serverUrl = await uploadToLocalMediaServer(blob, safeName);
    if (serverUrl) {
      return { url: serverUrl, source: 'server' };
    }

    return {
      url: typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '',
      source: 'inline',
      error: error?.message,
    };
  } catch (err) {
    console.warn('Supabase media upload error:', err);
    if (
      fileOrDataUrl instanceof File
        ? fileOrDataUrl.type.startsWith('image/')
        : typeof fileOrDataUrl === 'string' && fileOrDataUrl.startsWith('data:image/')
    ) {
      try {
        const compressed = await compressImageForCrossDevice(fileOrDataUrl, 155000);
        if (compressed && compressed.length <= 195000) {
          return { url: compressed, source: 'inline' };
        }
      } catch {
        // fall through
      }
    }
    return {
      url: typeof fileOrDataUrl === 'string' && !fileOrDataUrl.startsWith('idb://') ? fileOrDataUrl : '',
      source: 'inline',
      error: err instanceof Error ? err.message : 'Media upload failed',
    };
  }
}

export async function syncProductToSupabase(product: Product): Promise<boolean> {
  if (!product.id) return false;
  try {
    const { error } = await supabase.from('products').upsert({
      id: product.id,
      name: product.name,
      price: Number(product.price) || 0,
      category: product.category,
      collection: product.collection,
      image_url: product.imageUrl || null,
      gallery_images: product.galleryImages || [],
      image_color: product.imageColor || '#F8F7F3',
      variants: product.variants || [],
      total_stock: product.totalStock ?? null,
      description: product.description || null,
      details: product.details || null,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.warn('Supabase product sync warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase product sync error:', err);
    return false;
  }
}

export async function deleteProductFromSupabase(productId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) {
      console.warn('Supabase product delete warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase product delete error:', err);
    return false;
  }
}

export async function syncSettingsToSupabase(settings: Settings): Promise<boolean> {
  try {
    const { error } = await supabase.from('settings').upsert({
      id: 'global',
      brand_name: settings.brandName,
      logo_url: settings.logoUrl || null,
      hero_image_url: settings.heroImageUrl || null,
      hero_video_url: settings.heroVideoUrl || null,
      hero_video_urls: settings.heroVideoUrls || [],
      about_us_title: settings.aboutUsTitle || null,
      about_us_text: settings.aboutUsText || null,
      whatsapp_number: settings.whatsappNumber || '',
      raw_settings: settings,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.warn('Supabase settings sync warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase settings sync error:', err);
    return false;
  }
}

export async function syncCreatorPostToSupabase(post: CreatorPost): Promise<boolean> {
  if (!post.id) return false;
  try {
    const { error } = await supabase.from('creators_club').upsert({
      id: post.id,
      creator_name: post.creatorName,
      handle: post.handle,
      avatar_url: post.avatarUrl || null,
      media_url: post.mediaUrl,
      is_video: Boolean(post.isVideo),
      social_link: post.socialLink || null,
      caption: post.caption || null,
      tagged_product_ids: post.taggedProductIds || [],
      featured: post.featured ?? true,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.warn('Supabase creator post sync warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase creator post sync error:', err);
    return false;
  }
}

export async function deleteCreatorPostFromSupabase(postId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('creators_club').delete().eq('id', postId);
    if (error) {
      console.warn('Supabase creator post delete warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase creator post delete error:', err);
    return false;
  }
}

export async function syncStudioGalleryToSupabase(gallery: StudioGalleryState): Promise<boolean> {
  try {
    const { error } = await supabase.from('studio_gallery').upsert({
      id: 'config',
      layout_mode: gallery.layoutMode,
      title_layout: gallery.titleLayout || 'tile-corner',
      text_animation: gallery.textAnimation,
      kicker: gallery.kicker || '',
      header_title: gallery.headerTitle || '',
      header_description: gallery.headerDescription || '',
      items: gallery.items || [],
      raw_gallery: gallery,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.warn('Supabase studio gallery sync warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase studio gallery sync error:', err);
    return false;
  }
}

function mapSupabaseProductRow(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    category: row.category || 'SHIRTS',
    price: Number(row.price) || 0,
    imageColor: row.image_color || '#F8F7F3',
    imageUrl: row.image_url || undefined,
    galleryImages: Array.isArray(row.gallery_images) ? row.gallery_images : [],
    description: row.description || undefined,
    details: Array.isArray(row.details) ? row.details : undefined,
    variants: Array.isArray(row.variants) ? row.variants : [],
    totalStock: typeof row.total_stock === 'number' ? row.total_stock : undefined,
    collection: row.collection === 'featured' ? 'featured' : 'legacy',
  };
}

function mapSupabaseSettingsRow(row: any): Settings | null {
  if (!row) return null;
  if (row.raw_settings && typeof row.raw_settings === 'object') {
    return {
      ...row.raw_settings,
      whatsappNumber: row.whatsapp_number ?? row.raw_settings.whatsappNumber ?? '',
      heroVideoUrl: row.hero_video_url ?? row.raw_settings.heroVideoUrl,
      heroVideoUrls: row.hero_video_urls ?? row.raw_settings.heroVideoUrls,
    } as Settings;
  }
  return {
    brandName: row.brand_name || 'BROTHERHOOD',
    logoUrl: row.logo_url || undefined,
    heroImageUrl: row.hero_image_url || undefined,
    heroVideoUrl: row.hero_video_url || undefined,
    heroVideoUrls: Array.isArray(row.hero_video_urls) ? row.hero_video_urls : undefined,
    aboutUsTitle: row.about_us_title || undefined,
    aboutUsText: row.about_us_text || undefined,
    whatsappNumber: row.whatsapp_number || '',
    primaryColor: '#1A1815',
    backgroundColor: '#F8F7F3',
    heroHeadline: 'BrotherHood Collection',
    heroSubtitle: 'Full-Width Campaign Image / Video',
    featuredHeadline: 'Featured Collaboration',
    editorialHeadline: "Creator's Club Vol. 3",
  };
}

function mapSupabaseCreatorRow(row: any): CreatorPost {
  return {
    id: row.id,
    creatorName: row.creator_name || '',
    handle: row.handle || '@brotherhood',
    avatarUrl: row.avatar_url || undefined,
    mediaUrl: row.media_url || '',
    isVideo: Boolean(row.is_video),
    socialLink: row.social_link || undefined,
    caption: row.caption || undefined,
    taggedProductIds: Array.isArray(row.tagged_product_ids) ? row.tagged_product_ids : [],
    featured: row.featured ?? true,
  };
}

function mapSupabaseGalleryRow(row: any): StudioGalleryState | null {
  if (!row) return null;
  if (row.raw_gallery && typeof row.raw_gallery === 'object') {
    return row.raw_gallery as StudioGalleryState;
  }
  return {
    layoutMode: row.layout_mode || 'all',
    titleLayout: row.title_layout || 'tile-corner',
    textAnimation: row.text_animation || 'fadeUp',
    kicker: row.kicker || '',
    headerTitle: row.header_title || '',
    headerDescription: row.header_description || '',
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export async function fetchSupabaseData(): Promise<{
  products: Product[] | null;
  settings: Settings | null;
  creatorPosts: CreatorPost[] | null;
  studioGallery: StudioGalleryState | null;
}> {
  try {
    const [productsRes, settingsRes, creatorsRes, galleryRes] = await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('settings').select('*').eq('id', 'global').maybeSingle(),
      supabase.from('creators_club').select('*'),
      supabase.from('studio_gallery').select('*').eq('id', 'config').maybeSingle(),
    ]);

    return {
      products:
        !productsRes.error && Array.isArray(productsRes.data)
          ? productsRes.data.map(mapSupabaseProductRow)
          : null,
      settings:
        !settingsRes.error && settingsRes.data ? mapSupabaseSettingsRow(settingsRes.data) : null,
      creatorPosts:
        !creatorsRes.error && Array.isArray(creatorsRes.data)
          ? creatorsRes.data.map(mapSupabaseCreatorRow)
          : null,
      studioGallery:
        !galleryRes.error && galleryRes.data ? mapSupabaseGalleryRow(galleryRes.data) : null,
    };
  } catch (err) {
    console.warn('Supabase fetch notice:', err);
    return { products: null, settings: null, creatorPosts: null, studioGallery: null };
  }
}

export async function syncAllToSupabase(payload: {
  products?: Product[];
  settings?: Settings;
  creatorPosts?: CreatorPost[];
  studioGallery?: StudioGalleryState;
}) {
  const tasks: Promise<unknown>[] = [];
  if (payload.settings) tasks.push(syncSettingsToSupabase(payload.settings));
  if (payload.studioGallery) tasks.push(syncStudioGalleryToSupabase(payload.studioGallery));
  if (payload.products) {
    for (const p of payload.products) {
      if (p.id) tasks.push(syncProductToSupabase(p));
    }
  }
  if (payload.creatorPosts) {
    for (const cp of payload.creatorPosts) {
      if (cp.id) tasks.push(syncCreatorPostToSupabase(cp));
    }
  }
  await Promise.allSettled(tasks);
}
