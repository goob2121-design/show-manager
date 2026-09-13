"use client";

import { useEffect, useRef } from "react";

type AutoPrintOnMountProps = {
  closeAfterPrint?: boolean;
};

export function AutoPrintOnMount({ closeAfterPrint = false }: AutoPrintOnMountProps) {
  const hasPrintedRef = useRef(false);
  const hasRequestedCloseRef = useRef(false);

  useEffect(() => {
    const handleAfterPrint = () => {
      if (!closeAfterPrint || hasRequestedCloseRef.current) return;
      hasRequestedCloseRef.current = true;

      try {
        window.close();
      } catch {
        // Browsers may refuse to close a tab; leave the receipt available for manual printing.
      }
    };

    if (closeAfterPrint) {
      window.addEventListener("afterprint", handleAfterPrint);
    }

    const timerId = window.setTimeout(() => {
      if (hasPrintedRef.current) return;
      hasPrintedRef.current = true;
      window.print();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
      if (closeAfterPrint) {
        window.removeEventListener("afterprint", handleAfterPrint);
      }
    };
  }, [closeAfterPrint]);

  return null;
}
