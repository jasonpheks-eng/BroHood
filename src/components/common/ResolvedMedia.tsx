import React, { useState, useEffect, useRef } from 'react';
import { getMedia } from '../../mediaStore';

export function useResolvedMedia(src?: string): string {
  const [resolved, setResolved] = useState<string>(() =>
    src && src.startsWith('idb://') ? '' : src || ''
  );

  useEffect(() => {
    let isMounted = true;
    if (src && src.startsWith('idb://')) {
      setResolved('');
      getMedia(src).then((val) => {
        if (isMounted) {
          setResolved(val && !val.startsWith('idb://') ? val : '');
        }
      });
    } else {
      setResolved(src || '');
    }
    return () => {
      isMounted = false;
    };
  }, [src]);

  return resolved;
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

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !resolvedSrc || !autoPlay) return;
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.controls = false;
    el.play().catch(() => {
      // Ignore autoplay rejection on strict browsers when blocked by OS policy
    });
  }, [resolvedSrc, autoPlay]);

  if (!resolvedSrc) return null;
  return (
    <video
      key={resolvedSrc}
      ref={videoRef}
      src={resolvedSrc}
      autoPlay={autoPlay}
      controls={false}
      disablePictureInPicture
      disableRemotePlayback
      className={className ? `${className} autoplay-video` : 'autoplay-video'}
      {...props}
    />
  );
};
