import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getMedia, getCachedMediaSync } from '../../mediaStore';

export function useResolvedMediaState(src?: string): {
  resolvedSrc: string;
  isResolving: boolean;
} {
  const [state, setState] = useState<{ resolvedSrc: string; isResolving: boolean }>(() => {
    if (!src) return { resolvedSrc: '', isResolving: false };
    if (src.startsWith('idb://')) {
      const cached = getCachedMediaSync(src);
      return cached ? { resolvedSrc: cached, isResolving: false } : { resolvedSrc: '', isResolving: true };
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
      getMedia(src).then((val) => {
        if (isMounted) {
          setState({
            resolvedSrc: val && !val.startsWith('idb://') ? val : '',
            isResolving: false,
          });
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

export const ResolvedImage: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = ({
  src,
  alt = 'Media',
  ...props
}) => {
  const resolvedSrc = useResolvedMedia(src);
  if (!resolvedSrc) return null;
  return <img src={resolvedSrc} alt={alt} referrerPolicy="no-referrer" {...props} />;
};

export const ResolvedVideo: React.FC<React.VideoHTMLAttributes<HTMLVideoElement>> = ({
  src,
  autoPlay,
  className,
  ...props
}) => {
  const resolvedSrc = useResolvedMedia(src);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const applyAutoplayProps = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.controls = false;
    el.setAttribute('muted', '');
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', 'true');
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !resolvedSrc) return;
    applyAutoplayProps(el);
    if (!autoPlay) return;

    const tryPlay = () => {
      el.muted = true;
      el.defaultMuted = true;
      el.play().catch(() => {
        // Ignore strict browser autoplay rejection
      });
    };

    el.addEventListener('canplay', tryPlay);
    el.addEventListener('loadeddata', tryPlay);
    tryPlay();

    return () => {
      el.removeEventListener('canplay', tryPlay);
      el.removeEventListener('loadeddata', tryPlay);
    };
  }, [resolvedSrc, autoPlay, applyAutoplayProps]);

  if (!resolvedSrc) return null;
  return (
    <video
      key={resolvedSrc}
      ref={applyAutoplayProps}
      src={resolvedSrc}
      autoPlay={autoPlay}
      muted
      playsInline
      controls={false}
      disablePictureInPicture
      disableRemotePlayback
      className={className ? `${className} autoplay-video` : 'autoplay-video'}
      {...props}
    />
  );
};
