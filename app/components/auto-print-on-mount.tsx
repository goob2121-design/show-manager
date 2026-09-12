"use client";

import { useEffect, useRef } from "react";

export function AutoPrintOnMount() {
  const hasPrintedRef = useRef(false);

  useEffect(() => {
    if (hasPrintedRef.current) return;

    const timerId = window.setTimeout(() => {
      if (hasPrintedRef.current) return;
      hasPrintedRef.current = true;
      window.print();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  return null;
}
