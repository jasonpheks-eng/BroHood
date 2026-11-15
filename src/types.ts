export interface ProductVariant {
  size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'OS';
  stock: number;
}

export interface Product {
  id?: string;
  name: string;
  category: string;
  price: number;
  imageColor: string;
  imageUrl?: string;
  galleryImages?: string[];
  description?: string;
  details?: string[];
  variants?: ProductVariant[];
  totalStock?: number;
  collection: 'legacy' | 'featured';
  createdAt?: any;
}

export interface LookbookHotspot {
  id: string;
  productId: string;
  xPercent: number; // 0 - 100
  yPercent: number; // 0 - 100
  label?: string;
}

export interface LookbookSpread {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  description?: string;
  hotspots: LookbookHotspot[];
}

export type GalleryLayoutMode = 'all' | 'compact' | 'large' | 'minimal';
export type GalleryTitleLayout = 'tile-corner' | 'centered' | 'top-band' | 'editorial-serif';
export type GalleryTextAnimation = 'marquee' | 'pulse' | 'float' | 'fadeUp' | 'none';
export type GalleryTextPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type GalleryTileSize = '1x1' | '2x1' | '1x2' | '2x2';

export interface StudioGalleryMediaMetadata {
  mimeType?: string;
  fileName?: string;
  sizeBytes?: number;
  source?: 'upload' | 'url';
}

export interface StudioGalleryItem {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  mediaType?: 'image' | 'video';
  mediaMetadata?: StudioGalleryMediaMetadata;
  size: GalleryTileSize;
  textPosition: GalleryTextPosition;
}

export interface StudioGalleryState {
  layoutMode: GalleryLayoutMode;
  titleLayout?: GalleryTitleLayout;
  textAnimation: GalleryTextAnimation;
  kicker?: string;
  headerTitle?: string;
  headerDescription?: string;
  items: StudioGalleryItem[];
}

export interface SocialLinkItem {
  id: string;
  platform: string;
  tag: string;
  url: string;
}

export interface Settings {
  brandName: string;
  logoUrl?: string;
  heroImageUrl?: string;
  heroVideoUrl?: string;
  featuredImageUrl?: string;
  editorialImageUrl?: string;
  primaryColor: string;
  backgroundColor: string;
  heroHeadline: string;
  heroSubtitle: string;
  featuredHeadline: string;
  editorialHeadline: string;
  heroHeight?: string;
  heroContentAlign?: string;
  heroOverlayOpacity?: number;
  heroMediaFit?: 'cover' | 'contain';
  heroVideoZoom?: number;
  heroVideoPosition?: string;
  heroVideoUrls?: string[];
  heroImageZoom?: number;
  heroImagePosition?: string;
  featuredImageZoom?: number;
  featuredImagePosition?: string;
  editorialImageZoom?: number;
  editorialImagePosition?: string;
  footerImageZoom?: number;
  footerImagePosition?: string;
  footerImageUrl?: string;
  legacySectionBgColor?: string;
  legacySectionTextColor?: string;
  lookbookSpreads?: LookbookSpread[];
  lookbookTitle?: string;
  lookbookSubtitle?: string;
  galleryImageUrls?: string[];
  galleryHeadline?: string;
  studioGallery?: StudioGalleryState;
  aboutUsTitle?: string;
  aboutUsText?: string;
  whatsappNumber?: string;
  socialLinks?: SocialLinkItem[];
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseBucket?: string;
  settingsUpdatedAt?: number;
}

export interface CartItem extends Product {
  quantity: number;
  selectedSize?: string;
}

export interface CreatorPost {
  id?: string;
  creatorName: string;
  handle: string;
  avatarUrl?: string;
  mediaUrl: string;
  isVideo?: boolean;
  socialLink?: string;
  caption?: string;
  taggedProductIds?: string[];
  createdAt?: any;
  featured?: boolean;
}

