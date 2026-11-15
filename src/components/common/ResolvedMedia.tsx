import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getMedia, getCachedMediaSync, getServerMediaMirror } from '../../mediaStore';
import { getEmbedVideoInfo, normalizeMediaUrlInput } from '../../mediaUrlUtils';

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
      getMedia(src).then((val) => {
        if (isMounted) {
          setState({
            resolvedSrc: val && !val.startsWith('idb://') ? val : '',
            isResolving: false,
          });
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

export const ResolvedImage: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = ({
  src,
  alt = 'Media',
  ...props
}) => {
  const resolvedSrc = useResolvedMedia(src);
  if (!resolvedSrc || resolvedSrc.trim().startsWith('<')) return null;
  return <img src={resolvedSrc} alt={alt} referrerPolicy="no-referrer" {...props} />;
};

export const ResolvedVideo: React.FC<React.VideoHTMLAttributes<HTMLVideoElement>> = ({
  src,
  autoPlay,
  loop,
  muted,
  className,
  style,
  ...props
}) => {
  const embedInfo = React.useMemo(
    () => getEmbedVideoInfo(src, { loop: loop !== false, muted: muted !== false, autoplay: Boolean(autoPlay) }),
    [src, loop, muted, autoPlay]
  );
  const resolvedSrc = useResolvedMedia(embedInfo.isEmbed ? '' : src);
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
    if (embedInfo.isEmbed) return;
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

  if (!resolvedSrc || resolvedSrc.trim().startsWith('<')) return null;
  return (
    <video
      key={resolvedSrc}
      ref={applyAutoplayProps}
      src={resolvedSrc}
      autoPlay={autoPlay}
      loop={loop}
      muted
      playsInline
      controls={false}
      disablePictureInPicture
      disableRemotePlayback
      className={className ? `${className} autoplay-video` : 'autoplay-video'}
      style={style}
      {...props}
    />
  );
};
