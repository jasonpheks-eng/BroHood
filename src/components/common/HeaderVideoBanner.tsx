import React, { useState, useRef, useEffect } from 'react';
import { Settings } from '../../types';
import { ResolvedImage, useResolvedMedia } from './ResolvedMedia';
import { cn } from '../../utils';

interface HeaderVideoBannerProps {
  settings: Settings;
}

const DEFAULT_HERO_VIDEO_URL = '/assets/aistudio/brotherhood_hero_loop.mp4';

const isImageSource = (url?: string): boolean => {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.startsWith('data:image/')) return true;
  if (lower.match(/\.(jpeg|jpg|gif|png|webp|svg|avif|bmp|heic|heif)($|\?|#)/)) return true;
  return false;
};

export const HeaderVideoBanner: React.FC<HeaderVideoBannerProps> = ({ settings }) => {
  const [heroVideoIndex, setHeroVideoIndex] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const heroVideoRef = useRef<HTMLVideoElement>(null);

  // Unified Hero Media playlist (supports mixed videos + photos auto-cycling together)
  const heroMediaList = React.useMemo(() => {
    const rawList =
      settings.heroVideoUrls && settings.heroVideoUrls.length > 0
        ? settings.heroVideoUrls.filter((u) => Boolean(u && u.trim()))
        : [];
    const usableList = rawList.filter((u) => !u.startsWith('idb://'));
    if (usableList.length > 0) {
      return usableList;
    }
    if (settings.heroVideoUrl && !settings.heroVideoUrl.startsWith('idb://')) {
      return [settings.heroVideoUrl];
    }
    if (settings.heroImageUrl && !settings.heroImageUrl.startsWith('idb://')) {
      return [settings.heroImageUrl];
    }
    return [DEFAULT_HERO_VIDEO_URL];
  }, [settings.heroVideoUrls, settings.heroVideoUrl, settings.heroImageUrl]);

  useEffect(() => {
    if (heroVideoIndex >= heroMediaList.length) {
      setHeroVideoIndex(0);
    }
  }, [heroVideoIndex, heroMediaList.length]);

  const rawMediaSrc = heroMediaList[heroVideoIndex] || heroMediaList[0] || DEFAULT_HERO_VIDEO_URL;
  const activeMediaSrc = useResolvedMedia(rawMediaSrc);
  const srcToPlay =
    activeMediaSrc || (rawMediaSrc.startsWith('idb://') ? DEFAULT_HERO_VIDEO_URL : rawMediaSrc);
  const isCurrentItemImage = isImageSource(activeMediaSrc) || isImageSource(rawMediaSrc);
  const isBrotherhoodHero = srcToPlay.includes('brotherhood_hero_loop');

  const heroFitClass = settings.heroMediaFit === 'contain' ? 'object-contain' : 'object-cover';
  const heroZoom = Number(
    isCurrentItemImage
      ? settings.heroImageZoom ?? settings.heroVideoZoom ?? 1
      : settings.heroVideoZoom ?? settings.heroImageZoom ?? 1
  ) || 1;
  const heroPosition =
    (isCurrentItemImage
      ? settings.heroImagePosition || settings.heroVideoPosition
      : settings.heroVideoPosition || settings.heroImagePosition) || '50% 50%';

  // Seamless mixed-playlist auto-cycling & mobile autoplay enforcement (no play button)
  useEffect(() => {
    if (isCurrentItemImage) {
      setIsVideoPlaying(false);
      if (heroMediaList.length <= 1) return;
      const timer = setTimeout(() => {
        setHeroVideoIndex((prev) => (prev + 1) % heroMediaList.length);
      }, 5000);
      return () => clearTimeout(timer);
    }

    const video = heroVideoRef.current;
    if (!video) return;

    setIsVideoPlaying(!video.paused && !video.ended && video.readyState > 2);

    // Ensure strict mobile & desktop autoplay compliance
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.controls = false;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', 'true');

    if (video.getAttribute('src') !== srcToPlay) {
      video.setAttribute('src', srcToPlay);
      video.load();
    }

    const attemptPlay = () => {
      video.muted = true;
      video.defaultMuted = true;
      video.controls = false;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsVideoPlaying(true);
          })
          .catch(() => {
            setIsVideoPlaying(false);
          });
      }
    };

    const handlePlaying = () => setIsVideoPlaying(true);
    const handlePause = () => {
      if (!video.ended) {
        attemptPlay();
      }
    };

    const handleEnded = () => {
      if (heroMediaList.length > 1) {
        setHeroVideoIndex((prev) => (prev + 1) % heroMediaList.length);
      } else {
        video.currentTime = 0;
        attemptPlay();
      }
    };

    const handleError = () => {
      if (heroMediaList.length > 1) {
        setHeroVideoIndex((prev) => (prev + 1) % heroMediaList.length);
      }
    };

    const handleUserGestureRetry = () => {
      if (video.paused) {
        attemptPlay();
      }
    };

    attemptPlay();
    video.addEventListener('canplay', attemptPlay);
    video.addEventListener('loadeddata', attemptPlay);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);
    window.addEventListener('touchstart', handleUserGestureRetry, { passive: true, once: true });
    window.addEventListener('pointerdown', handleUserGestureRetry, { passive: true, once: true });

    return () => {
      video.removeEventListener('canplay', attemptPlay);
      video.removeEventListener('loadeddata', attemptPlay);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      window.removeEventListener('touchstart', handleUserGestureRetry);
      window.removeEventListener('pointerdown', handleUserGestureRetry);
    };
  }, [srcToPlay, isCurrentItemImage, heroMediaList.length]);

  return (
    <section
      className={cn(
        'relative z-0 w-full max-w-full overflow-hidden flex flex-col justify-between bg-white transition-all',
        settings.heroHeight ||
          'aspect-[4/3] sm:aspect-[16/9] md:aspect-[21/9] min-h-[260px] sm:min-h-[380px] md:min-h-[480px]',
        settings.heroContentAlign || 'items-center justify-center'
      )}
    >
      {/* Background Video / Image Playlist with Bidirectional Zoom & Fit Support */}
      <div className="absolute inset-0 z-0 bg-white overflow-hidden">
        <div
          className="w-full h-full transition-transform duration-300 ease-out"
          style={{
            transform: `scale(${heroZoom})`,
            transformOrigin: heroPosition,
          }}
        >
          {heroMediaList.length > 0 ? (
            isCurrentItemImage ? (
              <ResolvedImage
                src={rawMediaSrc}
                className={cn('w-full h-full transition-opacity duration-500', heroFitClass)}
                alt="Hero Campaign Media"
                style={{
                  objectPosition: heroPosition,
                }}
              />
            ) : (
              <>
                {/* Fallback poster shown only for default BrotherHood hero or when a custom hero fallback image is configured */}
                {!isVideoPlaying && (isBrotherhoodHero || settings.heroImageUrl) && (
                  <div className="absolute inset-0 z-10 bg-white flex items-center justify-center overflow-hidden pointer-events-none">
                    <img
                      src={
                        isBrotherhoodHero
                          ? '/assets/aistudio/BROTHERHOOD_FRONT_021800_4b36c0cc.jpg'
                          : settings.heroImageUrl!
                      }
                      alt="BrotherHood"
                      className={cn('w-full h-full', heroFitClass)}
                      style={{
                        objectPosition: heroPosition,
                      }}
                    />
                  </div>
                )}
                <video
                  key={srcToPlay}
                  ref={heroVideoRef}
                  src={srcToPlay}
                  muted
                  playsInline
                  autoPlay
                  preload="auto"
                  controls={false}
                  disablePictureInPicture
                  disableRemotePlayback
                  loop={heroMediaList.length === 1}
                  className={cn(
                    'w-full h-full pointer-events-none autoplay-video transition-opacity duration-300',
                    heroFitClass,
                    isVideoPlaying || (!isBrotherhoodHero && !settings.heroImageUrl)
                      ? 'opacity-100'
                      : 'opacity-0'
                  )}
                  style={{
                    objectPosition: heroPosition,
                  }}
                />
              </>
            )
          ) : settings.heroImageUrl ? (
            <ResolvedImage
              src={settings.heroImageUrl}
              className={cn('w-full h-full', heroFitClass)}
              alt="Header Hero"
              style={{
                objectPosition: heroPosition,
              }}
            />
          ) : (
            <div className="w-full h-full bg-white" />
          )}
        </div>
      </div>

      {/* Subtle multi-slide index indicator bar (only when 2+ hero media items exist) */}
      {heroMediaList.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 pointer-events-none">
          {heroMediaList.map((_, idx) => (
            <span
              key={idx}
              className={cn(
                'h-0.5 transition-all duration-300',
                idx === heroVideoIndex ? 'w-6 bg-black/80' : 'w-2.5 bg-black/25'
              )}
            />
          ))}
        </div>
      )}

      {/* Hero Content Container */}
      <div
        className={cn(
          'relative z-10 px-6 pt-24 pb-8 transition-all w-full max-w-[1600px] mx-auto pointer-events-none',
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
