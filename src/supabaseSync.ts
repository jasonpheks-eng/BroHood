import { supabase } from './supabase';
import { Product, Settings, CreatorPost } from './types';

export async function syncProductToSupabase(product: Product) {
  try {
    const { error } = await supabase.from('products').upsert({
      id: product.id,
      name: product.name,
      price: product.price,
      category: product.category,
      collection: product.collection,
      image_url: product.imageUrl,
      image_color: product.imageColor,
      variants: product.variants,
      description: product.description,
    });
    if (error) {
      console.warn('Supabase product sync warning:', error.message);
    }
  } catch (err) {
    console.warn('Supabase product sync error:', err);
  }
}

export async function deleteProductFromSupabase(productId: string) {
  try {
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) {
      console.warn('Supabase product delete warning:', error.message);
    }
  } catch (err) {
    console.warn('Supabase product delete error:', err);
  }
}

export async function syncSettingsToSupabase(settings: Settings) {
  try {
    const { error } = await supabase.from('settings').upsert({
      id: 'global',
      brand_name: settings.brandName,
      logo_url: settings.logoUrl,
      hero_image_url: settings.heroImageUrl,
      hero_video_url: settings.heroVideoUrl,
      hero_video_urls: settings.heroVideoUrls,
      about_us_title: settings.aboutUsTitle,
      about_us_text: settings.aboutUsText,
      whatsapp_number: settings.whatsappNumber,
      raw_settings: settings,
    });
    if (error) {
      console.warn('Supabase settings sync warning:', error.message);
    }
  } catch (err) {
    console.warn('Supabase settings sync error:', err);
  }
}

export async function syncCreatorPostToSupabase(post: CreatorPost) {
  try {
    const { error } = await supabase.from('creators_club').upsert({
      id: post.id,
      creator_name: post.creatorName,
      handle: post.handle,
      media_url: post.mediaUrl,
      is_video: post.isVideo,
      caption: post.caption,
      tagged_product_ids: post.taggedProductIds,
      featured: post.featured,
    });
    if (error) {
      console.warn('Supabase creator post sync warning:', error.message);
    }
  } catch (err) {
    console.warn('Supabase creator post sync error:', err);
  }
}

export async function fetchSupabaseData() {
  try {
    const [productsRes, settingsRes, creatorsRes] = await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('settings').select('*').eq('id', 'global').single(),
      supabase.from('creators_club').select('*'),
    ]);

    return {
      products: productsRes.data || null,
      settings: settingsRes.data || null,
      creatorPosts: creatorsRes.data || null,
    };
  } catch (err) {
    console.warn('Supabase fetch notice:', err);
    return { products: null, settings: null, creatorPosts: null };
  }
}
