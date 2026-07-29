"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface GalleryLightboxProps {
  urls: string[];
  /** Used for alt text, e.g. "Photo 2 of 6 at Bright Minds Tuition". */
  centreName: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

/**
 * Gallery grid plus a full-screen lightbox.
 *
 * The grid used to be plain <img> tags with a hover tint and no click handler,
 * so a photo could never be seen at more than thumbnail size.
 */
export default function GalleryLightbox({ urls, centreName }: GalleryLightboxProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Where the drag started. A ref because these are read in event handlers only
  // and should not trigger a render.
  const dragOrigin = useRef<{ startX: number; startY: number; originX: number; originY: number }>({
    startX: 0, startY: 0, originX: 0, originY: 0,
  });
  // Whether a drag is in progress IS rendered — it drives the cursor and
  // suppresses the transform transition — so it has to be state. Reading it from
  // the ref during render meant the cursor never actually changed to "grabbing".
  const [isDragging, setIsDragging] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Where focus was before the lightbox opened, so it can be handed back.
  const lastFocused = useRef<HTMLElement | null>(null);

  // createPortal needs a real `document`, which does not exist during SSR. No
  // mounted flag is needed for that here: the portal only renders once
  // `openIndex` is set, and the only thing that sets it is a click — which
  // cannot happen on the server.
  const isOpen = openIndex !== null;

  const resetView = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const close = useCallback(() => {
    setOpenIndex(null);
    resetView();
    lastFocused.current?.focus();
  }, [resetView]);

  const go = useCallback(
    (delta: number) => {
      setOpenIndex((current) => {
        if (current === null) return current;
        // Wraps, so the arrows are never dead ends.
        return (current + delta + urls.length) % urls.length;
      });
      resetView();
    },
    [urls.length, resetView]
  );

  const open = (index: number) => {
    lastFocused.current = document.activeElement as HTMLElement | null;
    setOpenIndex(index);
    resetView();
  };

  // Keyboard: Escape closes, arrows navigate, +/- zoom, 0 resets.
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          close();
          break;
        case "ArrowRight":
          e.preventDefault();
          go(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          go(-1);
          break;
        case "+":
        case "=":
          e.preventDefault();
          setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
          break;
        case "-":
          e.preventDefault();
          setZoom((z) => {
            const next = Math.max(MIN_ZOOM, z - ZOOM_STEP);
            if (next === MIN_ZOOM) setOffset({ x: 0, y: 0 });
            return next;
          });
          break;
        case "0":
          e.preventDefault();
          resetView();
          break;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    // Stop the page behind the overlay scrolling.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, close, go, resetView]);

  const onWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z - e.deltaY * 0.002));
      if (next === MIN_ZOOM) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= MIN_ZOOM) return;
    dragOrigin.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setOffset({
      x: dragOrigin.current.originX + (e.clientX - dragOrigin.current.startX),
      y: dragOrigin.current.originY + (e.clientY - dragOrigin.current.startY),
    });
  };

  const endDrag = () => setIsDragging(false);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {urls.map((url, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => open(idx)}
            aria-label={`Open photo ${idx + 1} of ${urls.length} full screen`}
            className="relative aspect-video sm:aspect-square md:aspect-video rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Photo ${idx + 1} of ${urls.length} at ${centreName}`}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
              <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
            </div>
          </button>
        ))}
      </div>

      {isOpen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Photo ${openIndex + 1} of ${urls.length} at ${centreName}`}
            className="fixed inset-0 z-[100] bg-black/95 flex flex-col animate-in fade-in duration-150"
            // Clicking the backdrop closes; clicks on the image itself do not
            // bubble here (see stopPropagation below).
            onClick={close}
          >
            {/* Top bar */}
            <div
              className="flex items-center justify-between gap-4 p-4 text-white shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-sm font-medium tabular-nums px-2">
                {openIndex + 1} / {urls.length}
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
                  disabled={zoom <= MIN_ZOOM}
                  aria-label="Zoom out"
                  className="p-2 rounded-lg hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ZoomOut className="w-5 h-5" />
                </button>
                <span className="text-xs tabular-nums w-12 text-center select-none">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
                  disabled={zoom >= MAX_ZOOM}
                  aria-label="Zoom in"
                  className="p-2 rounded-lg hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ZoomIn className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={resetView}
                  disabled={zoom === 1 && offset.x === 0 && offset.y === 0}
                  aria-label="Reset zoom"
                  className="p-2 rounded-lg hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={close}
                  aria-label="Close gallery"
                  className="p-2 rounded-lg hover:bg-white/15 transition-colors ml-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Stage */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden min-h-0">
              {urls.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); go(-1); }}
                  aria-label="Previous photo"
                  className="absolute left-2 sm:left-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white backdrop-blur-sm transition-colors"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={urls[openIndex]}
                alt={`Photo ${openIndex + 1} of ${urls.length} at ${centreName}`}
                draggable={false}
                onClick={(e) => e.stopPropagation()}
                onWheel={onWheel}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setZoom((z) => (z > MIN_ZOOM ? MIN_ZOOM : 2));
                  setOffset({ x: 0, y: 0 });
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="max-h-full max-w-full object-contain select-none"
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                  // No transition while dragging, or the image lags the cursor.
                  transition: isDragging ? "none" : "transform 150ms ease-out",
                  cursor: zoom > MIN_ZOOM ? (isDragging ? "grabbing" : "grab") : "zoom-in",
                }}
              />

              {urls.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); go(1); }}
                  aria-label="Next photo"
                  className="absolute right-2 sm:right-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white backdrop-blur-sm transition-colors"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </div>

            {/* Thumbnail strip */}
            {urls.length > 1 && (
              <div
                className="shrink-0 flex gap-2 overflow-x-auto p-4 justify-start sm:justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                {urls.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => { setOpenIndex(idx); resetView(); }}
                    aria-label={`Go to photo ${idx + 1}`}
                    aria-current={idx === openIndex}
                    className={`h-14 w-20 shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                      idx === openIndex
                        ? "border-white opacity-100"
                        : "border-transparent opacity-50 hover:opacity-80"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            <p className="text-center text-xs text-white/40 pb-3 px-4 hidden sm:block">
              Arrow keys to browse · scroll or +/− to zoom · drag to pan · Esc to close
            </p>
          </div>,
          document.body
        )}
    </>
  );
}
