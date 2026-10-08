export type DocumentSnapMode = "off" | "proximity" | "mandatory";
export const DOCUMENT_SNAP_MODES: { value: DocumentSnapMode; label: string }[] = [
  { value: "off", label: "OFF — Native Scrolling" },
  { value: "proximity", label: "PROXIMITY — Gentle Snap" },
  { value: "mandatory", label: "MANDATORY — Strong Snap" },
];

export function alignmentStatus(offset: number) {
  const distance = Math.abs(offset);
  return distance <= 2 ? "Aligned" : distance <= 24 ? "Slightly Off" : "Misaligned";
}

// Standards documents normally scroll their root element. CSS snap/padding propagate
// to the viewport from the root, not from body, so include root if the detected scroller
// differs. Never apply these styles to the inner lyric rail.
export function applyDocumentSnap(document: Document, mode: DocumentSnapMode, toolbarHeight: number) {
  const scrollingElement = document.scrollingElement ?? (document.compatMode === "BackCompat" ? document.body : document.documentElement);
  const targets = Array.from(new Set([scrollingElement, document.documentElement])).filter((element): element is HTMLElement => element !== null);
  const properties = mode === "off" ? ["scroll-snap-type"] : ["scroll-snap-type", "scroll-padding-top"];
  const originals = targets.map((element) => ({
    element,
    declarations: properties.map((property) => ({ property, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) })),
  }));
  for (const element of targets) {
    element.style.setProperty("scroll-snap-type", mode === "off" ? "none" : `y ${mode}`, "important");
    if (mode !== "off") element.style.setProperty("scroll-padding-top", `${Math.max(0, toolbarHeight)}px`, "important");
  }
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const { element, declarations } of originals) {
      for (const { property, value, priority } of declarations) {
        if (value) element.style.setProperty(property, value, priority);
        else element.style.removeProperty(property);
      }
    }
  };
}
