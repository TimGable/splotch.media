"use client";

import { useState } from "react";

export function FadeInImage({
  className = "",
  containerClassName = "",
  onLoad,
  ...props
}) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <span className={`block overflow-hidden ${containerClassName}`.trim()}>
      <img
        {...props}
        className={`${className} transition duration-500 ease-out ${
          isLoaded ? "opacity-100 blur-0 scale-100" : "opacity-0 blur-sm scale-[1.015]"
        }`.trim()}
        onLoad={(event) => {
          setIsLoaded(true);
          onLoad?.(event);
        }}
      />
    </span>
  );
}
