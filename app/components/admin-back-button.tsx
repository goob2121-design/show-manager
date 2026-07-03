"use client";

type AdminBackButtonProps = {
  fallbackHref?: string;
  label?: string;
  onBeforeNavigate?: () => void;
  className?: string;
};

export function AdminBackButton({
  fallbackHref = "/admin",
  label = "Back",
  onBeforeNavigate,
  className = "inline-flex items-center justify-center rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100",
}: AdminBackButtonProps) {
  function handleBack() {
    onBeforeNavigate?.();

    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get("returnTo");
    if (returnTo) {
      window.location.assign(returnTo);
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.assign(fallbackHref);
  }

  return (
    <button type="button" onClick={handleBack} className={className}>
      {label}
    </button>
  );
}
