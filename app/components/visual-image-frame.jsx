"use client";

export function VisualImageFrame({
  src,
  alt,
  className = "",
  imageClassName = "",
  draggable,
}) {
  return (
    <div className={`relative overflow-hidden bg-white/[0.03] ${className}`.trim()}>
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-2xl"
        draggable={false}
      />
      <div className="absolute inset-0 bg-black/18" />
      <img
        src={src}
        alt={alt}
        className={`relative z-10 h-full w-full object-contain ${imageClassName}`.trim()}
        draggable={draggable}
      />
    </div>
  );
}
