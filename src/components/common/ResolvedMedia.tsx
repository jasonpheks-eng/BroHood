import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getMedia, getCachedMediaSync, getServerMediaMirror } from '../../mediaStore';
import { getEmbedVideoInfo, normalizeMediaUrlInput } from '../../mediaUrlUtils';
import { MediaSkeleton } from './LoadingSkeletons';

export function useResolvedMediaState(rawSrc?: string): {
  resolvedSrc: string;
  isResolving: boolean;
} {
  const src = React.useMemo(() => normalizeMediaUrlInput(rawSrc), [rawSrc]);

  const [state, setState] = useState<{ resolvedSrc: string; isResolving: boolean }>(() => {
    if (!src) return { resolvedSrc: '', isResolving: false };
    if (src.startsWith('idb://')) {
      const cached = getCachedMediaSync(src);
      return cached ? { resolvedSrc: cached, isResolving: false } : { resolvedSrc: '', isResolving: true };
    }
    if (src.startsWith('/uploads/')) {
      const cachedMirror = getCachedMediaSync(src);
      return { resolvedSrc: cachedMirror || src, isResolving: false };
    }
    return { resolvedSrc: src, isResolving: false };
  });

  useEffect(() => {
    let isMounted = true;
    if (!src) {
      setState({ resolvedSrc: '', isResolving: false });
      return;
    }
    if (src.startsWith('idb://')) {
      const cached = getCachedMediaSync(src);
      if (cached) {
        setState({ resolvedSrc: cached, isResolving: false });
        return;
      }
      setState({ resolvedSrc: '', isResolving: true });
      getMedia(src).then(async (val) => {
        if (!isMounted) return;
        if (val && !val.startsWith('idb://')) {
          setState({ resolvedSrc: val, isResolving: false });
          return;
        }
        // Fallback: check if the server has a stored file for this media name
        try {
          const rawName = src.replace(/^idb:\/\/(vid|img)_\d+_/, '');
          const res = await fetch(`/api/resolve-idb?name=${encodeURIComponent(rawName)}`);
          if (res.ok) {
            const data = (await res.json()) as { url?: string };
            if (isMounted && data.url) {
              setState({ resolvedSrc: data.url, isResolving: false });
              return;
            }
          }
        } catch {
          // ignore
        }
        if (isMounted) {
          setState({ resolvedSrc: '', isResolving: false });
        }
      });
    } else if (src.startsWith('/uploads/')) {
      const cachedMirror = getCachedMediaSync(src);
      if (cachedMirror) {
        setState({ resolvedSrc: cachedMirror, isResolving: false });
        return;
      }
      setState({ resolvedSrc: src, isResolving: false });
      // Verify server file still exists; if container restarted or static host lacks it, fall back to IndexedDB mirror
      fetch(src, { method: 'HEAD' })
        .then(async (res) => {
          if (!isMounted || res.ok) return;
          const mirror = await getServerMediaMirror(src);
          if (isMounted && mirror) {
            setState({ resolvedSrc: mirror, isResolving: false });
          }
        })
        .catch(async () => {
          const mirror = await getServerMediaMirror(src);
          if (isMounted && mirror) {
            setState({ resolvedSrc: mirror, isResolving: false });
          }
        });
    } else {
      setState({ resolvedSrc: src, isResolving: false });
    }
    return () => {
      isMounted = false;
    };
  }, [src]);

  return state;
}

export function useResolvedMedia(src?: string): string {
  return useResolvedMediaState(src).resolvedSrc;
}

interface ResolvedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  skeleton?: 'light' | 'dark' | 'none';
}

export const ResolvedImage: React.FC<ResolvedImageProps> = ({
  src,
  alt = 'Media',
  skeleton = 'none',
  className,
  onLoad,
  onError,
  ...props
}) => {
  const { resolvedSrc, isResolving } = useResolvedMediaState(src);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
  }, [resolvedSrc]);

  const attachImgRef = useCallback((el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth > 0) {
      setIsLoaded(true);
    }
  }, []);

  if (!resolvedSrc || resolvedSrc.trim().startsWith('<')) {
    if (isResolving && skeleton !== 'none') {
      return <MediaSkeleton variant={skeleton} className="absolute inset-0 z-0" />;
    }
    return null;
  }

  const showSkeleton = skeleton !== 'none' && (!isLoaded || isResolving);

  return (
    <>
      {showSkeleton && (
        <MediaSkeleton variant={skeleton} className="absolute inset-0 z-0" />
      )}
      <img
        ref={attachImgRef}
        src={resolvedSrc}
        alt={alt}
        referrerPolicy="no-referrer"
        onLoad={(e) => {
          setIsLoaded(true);
          onLoad?.(e);
        }}
        onError={(e) => {
          setIsLoaded(true);
          onError?.(e);
        }}
        className={`${className || ''} transition-opacity duration-300 ${
          skeleton !== 'none' ? (isLoaded ? 'opacity-100' : 'opacity-0') : ''
        }`}
        {...props}
      />
    </>
  );
};

interface ResolvedVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  skeleton?: 'light' | 'dark' | 'none';
}

export const ResolvedVideo: React.FC<ResolvedVideoProps> = ({
  src,
  autoPlay,
  loop,
  muted,
  skeleton = 'dark',
  className,
  style,
  ...props
}) => {
  const embedInfo = React.useMemo(
    () => getEmbedVideoInfo(src, { loop: loop !== false, muted: muted !== false, autoplay: Boolean(autoPlay) }),
    [src, loop, muted, autoPlay]
  );
  const { resolvedSrc, isResolving } = useResolvedMediaState(embedInfo.isEmbed ? '' : src);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const applyAutoplayProps = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    el.volume = 0;
    el.playsInline = true;
    el.controls = false;
    el.removeAttribute('controls');
    el.setAttribute('muted', '');
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', 'true');
    el.setAttribute('disablepictureinpicture', '');
  }, []);

  useEffect(() => {
    setIsPlaying(false);
    if (embedInfo.isEmbed) return;
    const el = videoRef.current;
    if (!el || !resolvedSrc) return;
    applyAutoplayProps(el);
    if (!autoPlay) return;

    let disposed = false;
    let playPending = false;

    const tryPlay = () => {
      if (disposed || playPending) return;
      if (!el.paused && el.currentTime > 0) {
        setIsPlaying(true);
        return;
      }
      el.muted = true;
      el.defaultMuted = true;
      el.volume = 0;
      playPending = true;
      el.play()
        .then(() => {
          playPending = false;
          if (!disposed) setIsPlaying(true);
        })
        .catch(() => {
          playPending = false;
        });
    };

    const onPlaying = () => {
      if (!disposed) setIsPlaying(true);
    };

    const onTimeUpdate = () => {
      if (!disposed && !el.paused && el.currentTime > 0) setIsPlaying(true);
    };

    el.addEventListener('loadedmetadata', tryPlay);
    el.addEventListener('loadeddata', tryPlay);
    el.addEventListener('canplay', tryPlay);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('timeupdate', onTimeUpdate);
    window.addEventListener('touchstart', tryPlay, { passive: true });
    window.addEventListener('scroll', tryPlay, { passive: true });
    tryPlay();

    return () => {
      disposed = true;
      el.removeEventListener('loadedmetadata', tryPlay);
      el.removeEventListener('loadeddata', tryPlay);
      el.removeEventListener('canplay', tryPlay);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('timeupdate', onTimeUpdate);
      window.removeEventListener('touchstart', tryPlay);
      window.removeEventListener('scroll', tryPlay);
    };
  }, [embedInfo.isEmbed, resolvedSrc, autoPlay, applyAutoplayProps]);

  if (embedInfo.isEmbed && embedInfo.embedUrl) {
    return (
      <iframe
        key={embedInfo.embedUrl}
        src={embedInfo.embedUrl}
        title="Embedded Video"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        className={`${className || 'w-full h-full'} border-0 pointer-events-none bg-black`}
        style={style}
      />
    );
  }

  if (!resolvedSrc || resolvedSrc.trim().startsWith('<')) {
    if (isResolving && skeleton !== 'none') {
      return <MediaSkeleton variant={skeleton} className="absolute inset-0 z-0" />;
    }
    return null;
  }

  const visibilityClass = autoPlay
    ? isPlaying
      ? 'opacity-100'
      : 'opacity-0'
    : 'opacity-100';

  const showSkeleton = skeleton !== 'none' && (isResolving || (Boolean(autoPlay) && !isPlaying));

  return (
    <>
      {showSkeleton && (
        <MediaSkeleton variant={skeleton} className="absolute inset-0 z-0" />
      )}
      <video
        key={resolvedSrc}
        ref={applyAutoplayProps}
        src={resolvedSrc}
        autoPlay={autoPlay}
        loop={loop}
        muted
        playsInline
        preload="auto"
        controls={false}
        disablePictureInPicture
        disableRemotePlayback
        className={`${className ? `${className} ` : ''}autoplay-video transition-opacity duration-200 ${visibilityClass}`}
        style={style}
        {...props}
      />
    </>
  );
};

