import React, { useEffect } from 'react';

export interface HelmetProps {
  title?: string;
  description?: string;
  ogType?: 'website' | 'article' | 'product';
  ogImage?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
  structuredData?: Record<string, any>;
  children?: React.ReactNode;
}

function setOrCreateMeta(keyAttr: 'name' | 'property', keyValue: string, content: string) {
  if (typeof document === 'undefined') return;
  let element = document.head.querySelector(`meta[${keyAttr}="${keyValue}"]`) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(keyAttr, keyValue);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function removeMeta(keyAttr: 'name' | 'property', keyValue: string) {
  if (typeof document === 'undefined') return;
  const element = document.head.querySelector(`meta[${keyAttr}="${keyValue}"]`);
  if (element) {
    element.remove();
  }
}

export const Helmet: React.FC<HelmetProps> = ({
  title,
  description,
  ogType = 'website',
  ogImage,
  canonicalUrl,
  noIndex = false,
  structuredData,
  children,
}) => {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    // Update document title
    if (title) {
      document.title = title;
      setOrCreateMeta('property', 'og:title', title);
      setOrCreateMeta('name', 'twitter:title', title);
    }

    // Update meta description
    if (description) {
      setOrCreateMeta('name', 'description', description);
      setOrCreateMeta('property', 'og:description', description);
      setOrCreateMeta('name', 'twitter:description', description);
    }

    // OpenGraph type
    if (ogType) {
      setOrCreateMeta('property', 'og:type', ogType);
    }

    // OpenGraph / Twitter Image
    if (ogImage) {
      setOrCreateMeta('property', 'og:image', ogImage);
      setOrCreateMeta('name', 'twitter:image', ogImage);
    }

    // Robots meta for privacy (Admin view)
    if (noIndex) {
      setOrCreateMeta('name', 'robots', 'noindex, nofollow');
    } else {
      removeMeta('name', 'robots');
    }

    // Canonical link
    if (canonicalUrl) {
      let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
      }
      link.setAttribute('href', canonicalUrl);
    }

    // Structured Data JSON-LD
    let scriptTag: HTMLScriptElement | null = null;
    if (structuredData) {
      scriptTag = document.getElementById('applet-jsonld-schema') as HTMLScriptElement | null;
      if (!scriptTag) {
        scriptTag = document.createElement('script');
        scriptTag.id = 'applet-jsonld-schema';
        scriptTag.type = 'application/ld+json';
        document.head.appendChild(scriptTag);
      }
      scriptTag.textContent = JSON.stringify(structuredData);
    }

    return () => {
      if (noIndex) {
        removeMeta('name', 'robots');
      }
      if (scriptTag && scriptTag.parentNode) {
        scriptTag.parentNode.removeChild(scriptTag);
      }
    };
  }, [title, description, ogType, ogImage, canonicalUrl, noIndex, structuredData]);

  // Support React 19's native head hoisting alongside direct DOM hydration
  return (
    <>
      {title && <title>{title}</title>}
      {description && <meta name="description" content={description} />}
      {title && <meta property="og:title" content={title} />}
      {description && <meta property="og:description" content={description} />}
      {ogType && <meta property="og:type" content={ogType} />}
      {ogImage && <meta property="og:image" content={ogImage} />}
      {title && <meta name="twitter:title" content={title} />}
      {description && <meta name="twitter:description" content={description} />}
      {ogImage && <meta name="twitter:image" content={ogImage} />}
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
      {structuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      )}
      {children}
    </>
  );
};
