import React, { useState, useRef, useEffect } from 'react';
import { Settings } from '../../types';
import { ResolvedImage, useResolvedMedia } from './ResolvedMedia';
import { cn } from '../../utils';

interface HeaderVideoBannerProps {
  settings: Settings;
}

export const HeaderVideoBanner: React.FC<HeaderVideoBannerProps> = ({ settings }) => {
  const [heroVideoIndex, setHeroVideoIndex] = useState(0);
  const heroVideoRef = useRef<HTMLVideoElement>(null);

  // Hero Video playlist computation
  const heroVideoList = React.useMemo(() => {
    if (settings.heroVideoUrls && settings.heroVideoUrls.length > 0) {
      return settings.heroVideoUrls;
    }
    if (settings.heroVideoUrl) {
      return [settings.heroVideoUrl];
    }
    return ['/assets/aistudio/Scene-1_c77479cd.mp4'];
  }, [settings.heroVideoUrls, settings.heroVideoUrl]);

  // Helper to detect image sources in video playlist
  const isImageSource = (url?: string): boolean => {
    if (!url) return false;
    const lower = url.toLowerCase();
    if (lower.startsWith('data:image/')) return true;
    if (lower.match(/\.(jpeg|jpg|gif|png|webp|svg|avif)($|\?)/)) return true;
    return false;
  };

  const rawVideoSrc = heroVideoList[heroVideoIndex] || heroVideoList[0] || '/assets/aistudio/Scene-1_c77479cd.mp4';
  const activeVideoSrc = useResolvedMedia(rawVideoSrc);
  const isCurrentItemImage = isImageSource(activeVideoSrc) || isImageSource(rawVideoSrc);

  // Seamless playlist switching & mobile autoplay fix
  useEffect(() => {
    if (isCurrentItemImage) {
      const timer = setTimeout(() => {
        setHeroVideoIndex((prev) => (prev + 1) % heroVideoList.length);
      }, 6000);
      return () => clearTimeout(timer);
    } else {
      const video = heroVideoRef.current;
      if (!video) return;

      // Ensure mobile browser autoplay compliance
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;

      const srcToPlay = activeVideoSrc || rawVideoSrc;
      if (video.src !== srcToPlay) {
        video.src = srcToPlay;
        video.load();
      }

      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Retry playback if blocked on certain mobile browser policies
        });
      }

      const handleEnded = () => {
        setHeroVideoIndex((prev) => (prev + 1) % heroVideoList.length);
      };

      video.addEventListener('ended', handleEnded);
      return () => {
        video.removeEventListener('ended', handleEnded);
      };
    }
  }, [activeVideoSrc, rawVideoSrc, isCurrentItemImage, heroVideoList.length]);

  return (
    <section
      className={cn(
        "relative z-0 w-full overflow-hidden flex flex-col justify-between bg-white transition-all",
        settings.heroHeight || "aspect-[4/3] sm:aspect-[16/9] md:aspect-[21/9] min-h-[280px] sm:min-h-[380px] md:min-h-[480px]",
        settings.heroContentAlign || "items-center justify-center"
      )}
    >
      {/* Background Video / Image Playlist */}
      <div className="absolute inset-0 z-0 bg-white">
        {heroVideoList.length > 0 ? (
          isCurrentItemImage ? (
            <ResolvedImage
              src={rawVideoSrc}
              className="w-full h-full object-cover transition-opacity duration-500"
              alt="Header Hero Stage"
              style={{
                transform: `scale(${settings.heroImageZoom || settings.heroVideoZoom || 1})`,
                objectPosition: settings.heroImagePosition || settings.heroVideoPosition || '50% 50%',
              }}
            />
          ) : (
            <video
              ref={heroVideoRef}
              muted
              playsInline
              autoPlay
              loop={heroVideoList.length === 1}
              className="w-full h-full object-cover pointer-events-none"
              style={{
                transform: `scale(${settings.heroVideoZoom || 1})`,
                objectPosition: settings.heroVideoPosition || '50% 50%',
              }}
            />
          )
        ) : settings.heroImageUrl ? (
          <ResolvedImage
            src={settings.heroImageUrl}
            className="w-full h-full object-cover"
            alt="Header Hero"
            style={{
              transform: `scale(${settings.heroImageZoom || 1})`,
              objectPosition: settings.heroImagePosition || '50% 50%',
            }}
          />
        ) : (
          <div className="w-full h-full bg-white" />
        )}
      </div>

      {/* Hero Content Overlay */}
      <div
        className={cn(
          "relative z-10 px-6 pt-24 pb-8 transition-all w-full max-w-[1600px] mx-auto pointer-events-none",
          settings.heroContentAlign?.includes('justify-center')
            ? 'text-center'
            : settings.heroContentAlign?.includes('justify-start')
            ? 'text-left'
            : 'text-right'
        )}
      />
    </section>
  );
};
