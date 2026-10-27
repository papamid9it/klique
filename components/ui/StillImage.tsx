"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The first frame of an animated picture (a GIF avatar or banner), for people who want things still: the picture is
 * drawn once onto a canvas, which doesn't animate. Same size and fit as the <img> it stands in for.
 */
export function StillImage({ src, className, style, onError }: { src: string; className?: string; style?: React.CSSProperties; onError?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = canvas.current;
      if (!c) return;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")?.drawImage(img, 0, 0);
      setReady(true);
    };
    img.onerror = () => onError?.();
    img.src = src;
  }, [src, onError]);
  return <canvas ref={canvas} aria-hidden="true" className={className} style={{ objectFit: "cover", opacity: ready ? 1 : 0, ...style }} />;
}
