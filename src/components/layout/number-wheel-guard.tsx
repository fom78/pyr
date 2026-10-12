"use client";

import { useEffect } from "react";

/**
 * En la PC la rueda del mouse sobre un input numérico enfocado cambia su valor sin querer.
 * Lo desenfocamos al girar la rueda: la página scrollea y el valor queda como estaba.
 */
export function NumberWheelGuard() {
  useEffect(() => {
    const onWheel = () => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === "number") el.blur();
    };
    document.addEventListener("wheel", onWheel, { passive: true });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);
  return null;
}
