"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, Minus, Move, Plus, RotateCcw, X } from "lucide-react";
import { ViewportPortal } from "./viewport-portal";
import { PAGE_TRANSITION, SOFT_BUTTON_HOVER, SOFT_BUTTON_TAP, SOFT_PANEL_REVEAL } from "@/lib/motion";

const FALLBACK_VIEWPORT_SIZE = 360;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.01;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getOutputType(file) {
  if (file.type === "image/png" || file.type === "image/webp") {
    return file.type;
  }

  return "image/jpeg";
}

function getBaseScale(imageSize, viewportSize) {
  return Math.max(viewportSize / imageSize.width, viewportSize / imageSize.height);
}

function clampOffset(offset, imageSize, zoom, viewportSize) {
  const scale = getBaseScale(imageSize, viewportSize) * zoom;
  const displayedWidth = imageSize.width * scale;
  const displayedHeight = imageSize.height * scale;
  const maxX = Math.max(0, (displayedWidth - viewportSize) / 2);
  const maxY = Math.max(0, (displayedHeight - viewportSize) / 2);

  return {
    x: clamp(offset.x, -maxX, maxX),
    y: clamp(offset.y, -maxY, maxY),
  };
}

function buildCroppedFileName(file, outputType) {
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const extension = outputType === "image/png" ? "png" : outputType === "image/webp" ? "webp" : "jpg";
  return `${baseName}-cropped.${extension}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image for cropping."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image for cropping."));
    image.src = src;
  });
}

async function renderCroppedImageFile({
  file,
  src,
  imageSize,
  zoom,
  offset,
  viewportSize,
  outputSize,
}) {
  const image = await loadImage(src);
  const scale = getBaseScale(imageSize, viewportSize) * zoom;
  const sourceWidth = viewportSize / scale;
  const sourceHeight = viewportSize / scale;
  const sourceX = clamp(
    (imageSize.width - sourceWidth) / 2 - offset.x / scale,
    0,
    imageSize.width - sourceWidth,
  );
  const sourceY = clamp(
    (imageSize.height - sourceHeight) / 2 - offset.y / scale,
    0,
    imageSize.height - sourceHeight,
  );

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not initialize image crop renderer.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outputSize,
    outputSize,
  );

  const outputType = getOutputType(file);
  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, outputType, 0.92);
  });

  if (!blob) {
    throw new Error("Could not finalize cropped image.");
  }

  return new File([blob], buildCroppedFileName(file, outputType), {
    type: outputType,
    lastModified: Date.now(),
  });
}

export function ImageCropModal({
  file,
  title = "crop image",
  confirmLabel = "save crop",
  shape = "square",
  outputSize = 1200,
  onClose,
  onConfirm,
}) {
  const [previewSrc, setPreviewSrc] = useState("");
  const [imageSize, setImageSize] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreparingImage, setIsPreparingImage] = useState(true);
  const [error, setError] = useState("");
  const dragStateRef = useRef(null);
  const viewportRef = useRef(null);
  const [viewportSize, setViewportSize] = useState(FALLBACK_VIEWPORT_SIZE);

  useEffect(() => {
    let active = true;

    setPreviewSrc("");
    setImageSize(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setIsPreparingImage(true);
    setError("");

    readFileAsDataUrl(file)
      .then((nextSrc) => {
        if (!active) {
          return;
        }

        setPreviewSrc(nextSrc);
      })
      .catch((nextError) => {
        if (!active) {
          return;
        }

        setError(nextError instanceof Error ? nextError.message : "Could not read image for cropping.");
        setIsPreparingImage(false);
      });

    return () => {
      active = false;
    };
  }, [file]);

  useEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const updateViewportSize = () => {
      const nextSize = Math.max(1, Math.round(viewportElement.clientWidth));
      setViewportSize(nextSize);
    };

    updateViewportSize();

    const observer = new ResizeObserver(() => {
      updateViewportSize();
    });

    observer.observe(viewportElement);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!imageSize) {
      return;
    }

    setOffset((currentOffset) => clampOffset(currentOffset, imageSize, zoom, viewportSize));
  }, [imageSize, zoom, viewportSize]);

  const handleImageLoad = (event) => {
    const nextSize = {
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    };

    setImageSize(nextSize);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError("");
    setIsPreparingImage(false);
  };

  const displayedImageSize = useMemo(() => {
    if (!imageSize) {
      return { width: viewportSize, height: viewportSize };
    }

    const scale = getBaseScale(imageSize, viewportSize) * zoom;
    return {
      width: imageSize.width * scale,
      height: imageSize.height * scale,
    };
  }, [imageSize, zoom, viewportSize]);

  const updateZoom = (nextZoom) => {
    if (!imageSize) {
      return;
    }

    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    setZoom(clampedZoom);
    setOffset((currentOffset) =>
      clampOffset(currentOffset, imageSize, clampedZoom, viewportSize),
    );
  };

  const resetCrop = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError("");
  };

  const handlePointerDown = (event) => {
    if (!imageSize) {
      return;
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (event) => {
    if (!imageSize || !dragStateRef.current) {
      return;
    }

    const deltaX = event.clientX - dragStateRef.current.startX;
    const deltaY = event.clientY - dragStateRef.current.startY;
    const nextOffset = clampOffset(
      {
        x: dragStateRef.current.originX + deltaX,
        y: dragStateRef.current.originY + deltaY,
      },
      imageSize,
      zoom,
      viewportSize,
    );

    setOffset(nextOffset);
  };

  const endDrag = (event) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
    setIsDragging(false);
  };

  const handleWheel = (event) => {
    if (!imageSize) {
      return;
    }

    event.preventDefault();
    updateZoom(zoom + (event.deltaY < 0 ? 0.08 : -0.08));
  };

  const handleConfirm = async () => {
    if (!imageSize || isSaving) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const croppedFile = await renderCroppedImageFile({
        file,
        src: previewSrc,
        imageSize,
        zoom,
        offset,
        viewportSize,
        outputSize,
      });

      await onConfirm(croppedFile);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not crop image.");
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
  };

  const zoomPercent = `${Math.round(zoom * 100)}%`;

  return (
    <ViewportPortal>
      <motion.div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/88 px-4 py-6 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => {
          if (!isSaving) {
            onClose();
          }
        }}
      >
        <motion.div
          className="w-full max-w-5xl border border-white/15 bg-[linear-gradient(180deg,rgba(14,14,14,0.98),rgba(6,6,6,0.98))] shadow-[0_30px_120px_rgba(0,0,0,0.45)]"
          {...SOFT_PANEL_REVEAL}
          transition={PAGE_TRANSITION}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5 md:px-7">
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-gray-500">image crop</p>
              <h3 className="text-2xl">{title}</h3>
            </div>

            <motion.button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex h-10 w-10 items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/35 hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
              aria-label="Close image crop modal"
              whileHover={SOFT_BUTTON_HOVER}
              whileTap={SOFT_BUTTON_TAP}
            >
              <X className="h-4 w-4" />
            </motion.button>
          </div>

          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="border-b border-white/10 p-5 md:p-7 lg:border-b-0 lg:border-r">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-gray-500">
                  <Move className="h-3.5 w-3.5" />
                  <span>drag to reframe</span>
                </div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                  {zoomPercent}
                </div>
              </div>

              <div className="relative mx-auto w-full max-w-[30rem]">
                <div
                  ref={viewportRef}
                  className="relative aspect-square w-full overflow-hidden border border-white/12 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),rgba(255,255,255,0.015))]"
                  style={{ touchAction: "none" }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onWheel={handleWheel}
                >
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(0deg,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:2rem_2rem]" />

                  {previewSrc ? (
                    <img
                      src={previewSrc}
                      alt="Crop preview"
                      onLoad={handleImageLoad}
                      onError={() => {
                        setError("Could not load image for cropping.");
                        setIsPreparingImage(false);
                      }}
                      draggable={false}
                      className={`pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none ${
                        isDragging ? "cursor-grabbing" : "cursor-grab"
                      }`}
                      style={{
                        width: `${displayedImageSize.width}px`,
                        height: `${displayedImageSize.height}px`,
                        transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                        opacity: isPreparingImage ? 0 : 1,
                      }}
                    />
                  ) : null}

                  {isPreparingImage ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex items-end gap-1.5">
                          {[0, 1, 2, 3].map((bar) => (
                            <motion.span
                              key={bar}
                              className="block w-1.5 rounded-full bg-white/75 shadow-[0_0_14px_rgba(255,255,255,0.14)]"
                              animate={{
                                height: [14, 30, 18, 26, 14],
                                opacity: [0.35, 0.95, 0.45, 0.85, 0.35],
                              }}
                              transition={{
                                duration: 1.05,
                                repeat: Infinity,
                                ease: "easeInOut",
                                delay: bar * 0.08,
                              }}
                            />
                          ))}
                        </div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                          preparing image
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {shape === "circle" ? (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="h-[76%] w-[76%] rounded-full border border-white/40 shadow-[0_0_0_999px_rgba(0,0,0,0.52)]" />
                    </div>
                  ) : (
                    <div className="pointer-events-none absolute inset-5 border border-white/35 shadow-[0_0_0_999px_rgba(0,0,0,0.48)]" />
                  )}

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/30 to-transparent" />
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between bg-white/[0.025] p-5 md:p-6">
              <div>
                <div className="mb-6">
                  <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-gray-500">zoom</p>

                  <div className="mb-4 flex items-center gap-3">
                    <motion.button
                      type="button"
                      onClick={() => updateZoom(zoom - 0.08)}
                      disabled={isSaving || zoom <= MIN_ZOOM}
                      className="flex h-11 w-11 items-center justify-center border border-white/15 text-gray-300 transition-colors hover:border-white/35 hover:bg-white/[0.05] hover:text-white disabled:opacity-35"
                      whileHover={SOFT_BUTTON_HOVER}
                      whileTap={SOFT_BUTTON_TAP}
                    >
                      <Minus className="h-4 w-4" />
                    </motion.button>

                    <input
                      type="range"
                      min={MIN_ZOOM}
                      max={MAX_ZOOM}
                      step={ZOOM_STEP}
                      value={zoom}
                      onChange={(event) => updateZoom(Number(event.target.value))}
                      disabled={isSaving || !imageSize}
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-white"
                    />

                    <motion.button
                      type="button"
                      onClick={() => updateZoom(zoom + 0.08)}
                      disabled={isSaving || zoom >= MAX_ZOOM}
                      className="flex h-11 w-11 items-center justify-center border border-white/15 text-gray-300 transition-colors hover:border-white/35 hover:bg-white/[0.05] hover:text-white disabled:opacity-35"
                      whileHover={SOFT_BUTTON_HOVER}
                      whileTap={SOFT_BUTTON_TAP}
                    >
                      <Plus className="h-4 w-4" />
                    </motion.button>
                  </div>

                </div>

                {error ? (
                  <div className="mb-5 border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {error}
                  </div>
                ) : null}
              </div>

              <div className="space-y-3 border-t border-white/10 pt-5">
                <div className="flex gap-3">
                  <motion.button
                    type="button"
                    onClick={resetCrop}
                    disabled={isSaving || !imageSize}
                    className="flex flex-1 items-center justify-center gap-2 border border-white/15 px-4 py-3 text-gray-300 transition-colors hover:border-white/35 hover:bg-white/[0.04] hover:text-white disabled:opacity-40"
                    whileHover={SOFT_BUTTON_HOVER}
                    whileTap={SOFT_BUTTON_TAP}
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>reset</span>
                  </motion.button>

                  <motion.button
                    type="button"
                    onClick={onClose}
                    disabled={isSaving}
                    className="flex-1 border border-white/15 px-4 py-3 text-gray-300 transition-colors hover:border-white/35 hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
                    whileHover={SOFT_BUTTON_HOVER}
                    whileTap={SOFT_BUTTON_TAP}
                  >
                    cancel
                  </motion.button>
                </div>

                <motion.button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isSaving || !imageSize || !previewSrc}
                  className="flex w-full items-center justify-center gap-2 border border-white/40 bg-white px-4 py-3.5 text-black transition-colors hover:bg-white/90 disabled:opacity-50"
                  whileHover={SOFT_BUTTON_HOVER}
                  whileTap={SOFT_BUTTON_TAP}
                >
                  <Check className="h-4 w-4" />
                  <span>{isSaving ? "saving..." : confirmLabel}</span>
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </ViewportPortal>
  );
}
