import React, { useState, useRef, useEffect } from 'react';
import { Settings } from '../../types';
import { ResolvedImage, useResolvedMedia } from './ResolvedMedia';
import { cn } from '../../utils';

interface HeaderVideoBannerProps {
  settings: Settings;
}

const DEFAULT_HERO_VIDEO_URL = '/assets/aistudio/brotherhood_hero_loop.mp4';

export const HeaderVideoBanner: React.FC<HeaderVideoBannerProps> = ({ settings }) => {
  const [heroVideoIndex, setHeroVideoIndex] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const heroVideoRef = useRef<HTMLVideoElement>(null);

  // Hero Video playlist computation (never let broken idb:// links block the default video)
  const heroVideoList = React.useMemo(() => {
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
    return [DEFAULT_HERO_VIDEO_URL];
  }, [settings.heroVideoUrls, settings.heroVideoUrl]);

  // Helper to detect image sources in video playlist
  const isImageSource = (url?: string): boolean => {
    if (!url) return false;
    const lower = url.toLowerCase();
    if (lower.startsWith('data:image/')) return true;
    if (lower.match(/\.(jpeg|jpg|gif|png|webp|svg|avif)($|\?)/)) return true;
    return false;
  };

  const rawVideoSrc = heroVideoList[heroVideoIndex] || heroVideoList[0] || DEFAULT_HERO_VIDEO_URL;
  const activeVideoSrc = useResolvedMedia(rawVideoSrc);
  const srcToPlay = activeVideoSrc || (rawVideoSrc.startsWith('idb://') ? DEFAULT_HERO_VIDEO_URL : rawVideoSrc);
  const isCurrentItemImage = isImageSource(activeVideoSrc) || isImageSource(rawVideoSrc);
  const isBrotherhoodHero = srcToPlay.includes('brotherhood_hero_loop');

  // Seamless playlist switching & mobile autoplay enforcement (no play button)
  useEffect(() => {
    if (isCurrentItemImage) {
      setIsVideoPlaying(false);
      const timer = setTimeout(() => {
        setHeroVideoIndex((prev) => (prev + 1) % heroVideoList.length);
      }, 6000);
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
      if (heroVideoList.length > 1) {
        setHeroVideoIndex((prev) => (prev + 1) % heroVideoList.length);
      } else {
        video.currentTime = 0;
        attemptPlay();
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
    window.addEventListener('touchstart', handleUserGestureRetry, { passive: true, once: true });
    window.addEventListener('pointerdown', handleUserGestureRetry, { passive: true, once: true });

    return () => {
      video.removeEventListener('canplay', attemptPlay);
      video.removeEventListener('loadeddata', attemptPlay);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      window.removeEventListener('touchstart', handleUserGestureRetry);
      window.removeEventListener('pointerdown', handleUserGestureRetry);
    };
  }, [srcToPlay, isCurrentItemImage, heroVideoList.length]);

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
              className="w-full h-full object-cover hero-autoplay-breathe"
              alt="Header Hero Stage"
              style={{
                transform: `scale(${settings.heroImageZoom || settings.heroVideoZoom || 1})`,
                objectPosition: settings.heroImagePosition || settings.heroVideoPosition || '50% 50%',
              }}
            />
          ) : (
            <>
              {/* Animated fallback layer shown seamlessly if a mobile browser (e.g. Low Power Mode) pauses autoplay, hiding any OS play button */}
              {!isVideoPlaying && (
                <div className="absolute inset-0 z-10 bg-white flex items-center justify-center overflow-hidden pointer-events-none">
                  <img
                    src={isBrotherhoodHero ? '/assets/aistudio/BROTHERHOOD_FRONT_021800_4b36c0cc.jpg' : (settings.heroImageUrl || '/assets/aistudio/BROTHERHOOD_FRONT_021800_4b36c0cc.jpg')}
                    alt="BrotherHood"
                    className="w-full h-full object-contain scale-125 md:scale-110 hero-autoplay-breathe"
                  />
                </div>
              )}
              <video
                ref={heroVideoRef}
                src={srcToPlay}
                muted
                playsInline
                autoPlay
                preload="auto"
                controls={false}
                disablePictureInPicture
                disableRemotePlayback
                loop={heroVideoList.length === 1}
                className={cn(
                  "w-full h-full object-cover pointer-events-none autoplay-video transition-opacity duration-300",
                  isVideoPlaying ? "opacity-100" : "opacity-0"
                )}
                style={{
                  transform: `scale(${settings.heroVideoZoom || 1})`,
                  objectPosition: settings.heroVideoPosition || '50% 50%',
                }}
              />
            </>
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
