"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ShowRecord } from "@/lib/types";
import {
  DOOR_WELCOME_EVENT_VERSION,
  DOOR_WELCOME_IDLE_TIMEOUT_MS,
  DOOR_WELCOME_MESSAGE_TYPE,
  doorWelcomeChannelName,
  type DoorWelcomeEvent,
} from "@/lib/door-welcome-display";
import {
  POST_SHOW_HEADLINE,
  buildTimedIdleMessages,
  chunkDoorWelcomeSeats,
  doorWelcomeGuestCount,
  resolveTimedIdleWindow,
} from "@/lib/door-welcome-presentation";

const DISPLAY_TRANSITION_MS = 250;
const IDLE_ROTATION_INTERVAL_MS = 15_000;
const HERO_LOGO_CONTAINER_CLASS = "mx-auto flex h-[min(38vh,26rem)] w-[min(68vw,52rem)] items-center justify-center p-[clamp(0.125rem,0.5vw,0.5rem)]";
const HERO_LOGO_IMAGE_CLASS = "h-full w-full object-contain motion-safe:animate-[logo-swap-in_400ms_ease-out]";
type WelcomeSponsorLogo = {
  name: string;
  logoUrl: string;
};

type WelcomeShowRow = Pick<ShowRecord, "show_date" | "venue"> & {
  show_sponsors?: Array<{
    placement_order: number;
    sponsor: { name: string; logo_url: string | null } | Array<{ name: string; logo_url: string | null }> | null;
  }>;
};
function formatDisplayDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function guestNameSizeClass(name: string) {
  if (name.length > 36) return "text-[clamp(2rem,5.2vw,5rem)]";
  if (name.length > 24) return "text-[clamp(2.25rem,6.2vw,6.25rem)]";
  return "text-[clamp(2.5rem,7.5vw,7.5rem)]";
}

function isDoorWelcomeEvent(value: unknown, showSlug: string): value is DoorWelcomeEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<DoorWelcomeEvent>;
  return event.version === DOOR_WELCOME_EVENT_VERSION &&
    event.messageType === DOOR_WELCOME_MESSAGE_TYPE &&
    event.showSlug === showSlug &&
    typeof event.quantityCheckedIn === "number" &&
    event.quantityCheckedIn > 0 &&
    Array.isArray(event.assignedSeatLabels);
}

export function DoorWelcomeDisplay({ showSlug }: { showSlug: string }) {
  const [show, setShow] = useState<Pick<ShowRecord, "show_date" | "venue"> | null>(null);
  const [nextShowDate, setNextShowDate] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [sponsorLogos, setSponsorLogos] = useState<WelcomeSponsorLogo[]>([]);
  const [welcome, setWelcome] = useState<DoorWelcomeEvent | null>(null);
  const [isWelcomeExiting, setIsWelcomeExiting] = useState(false);
  const [idleMessageIndex, setIdleMessageIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setFullscreenSupported(typeof document.documentElement.requestFullscreen === "function");
    });
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);


  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("shows")
        .select("show_date, venue, show_sponsors(placement_order, sponsor:sponsor_library(name, logo_url))")
        .eq("slug", showSlug)
        .single();
      if (!active || !data) return;
      const normalizedShow = data as unknown as WelcomeShowRow;
      setShow(normalizedShow);
      const logos = [...(normalizedShow.show_sponsors ?? [])]
        .sort((left, right) => left.placement_order - right.placement_order)
        .flatMap((item) => {
          const sponsor = Array.isArray(item.sponsor) ? item.sponsor[0] : item.sponsor;
          const name = sponsor?.name?.trim();
          const logoUrl = sponsor?.logo_url?.trim();
          return name && logoUrl ? [{ name, logoUrl }] : [];
        })
        .filter((logo, index, items) => items.findIndex((item) => item.logoUrl === logo.logoUrl) === index);
      setSponsorLogos(logos);
      if (normalizedShow.show_date) {
        const { data: nextShow } = await supabase
          .from("shows")
          .select("show_date")
          .gt("show_date", normalizedShow.show_date)
          .eq("is_archived", false)
          .order("show_date", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (active) setNextShowDate(nextShow?.show_date ?? null);
      }
    })();
    return () => {
      active = false;
    };
  }, [showSlug]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(doorWelcomeChannelName(showSlug));
      channel.onmessage = (message: MessageEvent<unknown>) => {
        if (!isDoorWelcomeEvent(message.data, showSlug)) return;
        setIdleMessageIndex(0);
        setIsWelcomeExiting(false);
        setWelcome(message.data);
      };
    } catch {
      channel = null;
    }
    return () => channel?.close();
  }, [showSlug]);

  useEffect(() => {
    if (!welcome) return;
    const idleTimeout = window.setTimeout(() => {
      setIsWelcomeExiting(true);
    }, DOOR_WELCOME_IDLE_TIMEOUT_MS);
    const clearTimeout = window.setTimeout(() => {
      setWelcome(null);
      setIsWelcomeExiting(false);
      setClockNow(Date.now());
    }, DOOR_WELCOME_IDLE_TIMEOUT_MS + DISPLAY_TRANSITION_MS);
    return () => {
      window.clearTimeout(idleTimeout);
      window.clearTimeout(clearTimeout);
    };
  }, [welcome]);

  useEffect(() => {
    if (welcome) return;
    const rotation = window.setInterval(() => {
      setIdleMessageIndex((current) => current + 1);
    }, IDLE_ROTATION_INTERVAL_MS);
    return () => window.clearInterval(rotation);
  }, [welcome]);


  useEffect(() => {
    const clock = window.setInterval(() => {
      setClockNow(Date.now());
    }, 60_000);
    return () => window.clearInterval(clock);
  }, []);
  const timedIdleWindow = resolveTimedIdleWindow(clockNow);
  const idleMessages = buildTimedIdleMessages(timedIdleWindow);
  const activeIdleIndex = idleMessageIndex % idleMessages.length;
  const activeIdleMessage = idleMessages[activeIdleIndex];
  const isSponsorSlide = activeIdleMessage === "Thank You to Our Sponsors";
  const sponsorCycle = Math.floor(idleMessageIndex / idleMessages.length);
  const activeSponsorLogo = isSponsorSlide && sponsorLogos.length > 0
    ? sponsorLogos[sponsorCycle % sponsorLogos.length]
    : null;
  const showWelcome = Boolean(welcome) && !isWelcomeExiting;
  const showDate = formatDisplayDate(show?.show_date);
  const showVenue = show?.venue?.trim() || null;

  return (
    <main className="relative grid h-screen min-h-[24rem] place-items-center overflow-hidden bg-[#071426] px-[clamp(1rem,4vw,5rem)] py-[clamp(1rem,3vh,2.5rem)] text-center text-white">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(202,160,58,0.09),transparent_32%),linear-gradient(135deg,#071426,#101820_42%,#0b2135_72%,#071426)] bg-[length:160%_160%] motion-safe:animate-[venue-gradient_50s_ease-in-out_infinite]" />
      {fullscreenSupported && !isFullscreen ? (
        <button
          type="button"
          onClick={() => void document.documentElement.requestFullscreen()}
          className="absolute right-4 top-4 z-30 rounded-lg border border-white/20 bg-black/30 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-black/50 focus:outline-none focus:ring-2 focus:ring-[#d5aa42] motion-reduce:transition-none"
        >
          Enter Full Screen
        </button>
      ) : null}

      <div className="relative z-10 grid h-full w-full max-w-[90rem] place-items-center">
        <section
          aria-hidden={showWelcome}
          className={`col-start-1 row-start-1 mx-auto flex max-h-full w-full flex-col items-center justify-center gap-[clamp(0.75rem,2.2vh,1.75rem)] text-center transition-opacity duration-[250ms] ease-out motion-reduce:transition-none ${
            showWelcome ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <div className={HERO_LOGO_CONTAINER_CLASS} aria-live="off">
            {activeSponsorLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={activeSponsorLogo.logoUrl}
                src={activeSponsorLogo.logoUrl}
                alt={`${activeSponsorLogo.name} logo`}
                className={HERO_LOGO_IMAGE_CLASS}
              />
            ) : (
              <Image
                key="cmms-logo"
                src="/cmms-logo.png"
                alt="Cumberland Mountain Music Show"
                width={900}
                height={415}
                priority
                className={HERO_LOGO_IMAGE_CLASS}
              />
            )}
          </div>
          <h1 className="sr-only">Welcome to the Cumberland Mountain Music Show</h1>
          <div
            key={activeIdleIndex}
            aria-hidden="true"
            className="mx-auto flex min-h-[clamp(7rem,18vh,13rem)] w-full max-w-6xl flex-col items-center justify-center text-center motion-safe:animate-[idle-message-in_400ms_ease-out]"
          >
            <p className="mx-auto text-balance text-[clamp(2rem,5.4vw,5.75rem)] font-bold leading-[1.08]">
              {activeIdleMessage === "Welcome to the Cumberland Mountain Music Show" ? (
                <>Welcome to the<br />Cumberland Mountain Music Show</>
              ) : activeIdleMessage === POST_SHOW_HEADLINE ? (
                <>{POST_SHOW_HEADLINE}<span className="mt-3 block text-[0.48em] font-semibold leading-snug">Please Drive Safely<br />We Hope to See You Again Soon</span></>
              ) : activeIdleMessage}
            </p>
          </div>
          <p className="mx-auto flex flex-col items-center gap-1 text-center text-[clamp(1.1rem,2.2vw,2.15rem)] font-semibold leading-snug tracking-wide text-[#e2bc59]">
            <span>Big-Time Show</span>
            <span>Small-Town Hospitality</span>
          </p>
          <div className="mx-auto flex min-h-[clamp(2.75rem,7vh,4.5rem)] w-full flex-col items-center justify-center text-center text-[clamp(0.95rem,1.6vw,1.45rem)] leading-relaxed text-white/70">
            {showDate ? <p>{showDate}</p> : null}
            {showVenue ? <p>{showVenue}</p> : null}
            {activeIdleMessage === POST_SHOW_HEADLINE && nextShowDate ? (
              <p className="mt-1 font-semibold text-[#e2bc59]">See You {formatDisplayDate(nextShowDate)}</p>
            ) : null}
          </div>
          <p className="mx-auto w-full text-center text-[clamp(1rem,1.65vw,1.5rem)] font-medium tracking-wide text-white/85">
            www.cumberlandmountainmusic.com
          </p>
        </section>

        {welcome ? (
          <section
            key={welcome.timestamp}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-hidden={!showWelcome}
            className={`col-start-1 row-start-1 mx-auto flex max-h-full w-full flex-col items-center justify-center gap-[clamp(0.75rem,2.2vh,1.75rem)] text-center transition-opacity duration-[250ms] ease-out motion-reduce:transition-none ${
              showWelcome ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <Image
              src="/cmms-logo.png"
              alt="Cumberland Mountain Music Show"
              width={900}
              height={415}
              priority
              className="mx-auto h-auto max-h-[24vh] w-[clamp(13rem,36vw,32rem)] object-contain"
            />
            <h1 className="mx-auto mt-[clamp(0.75rem,2.5vh,2rem)] w-full text-center text-[clamp(1.15rem,2.5vw,2.5rem)] font-semibold uppercase tracking-[0.18em] text-[#e2bc59]">
              Now Welcoming
            </h1>
            {welcome.displayName ? (
              <div className="relative mx-auto mt-[clamp(0.75rem,2.5vh,2rem)] flex max-w-full justify-center px-2 text-center">
                <div aria-hidden="true" className="absolute -inset-x-[12%] -inset-y-[70%] -z-10 rounded-full bg-[radial-gradient(ellipse,rgba(213,170,66,0.18),transparent_68%)] opacity-0 blur-2xl motion-safe:animate-[guest-spotlight_9500ms_ease-out_forwards]" />
                <h2 className={`relative max-w-[94vw] text-balance [overflow-wrap:anywhere] font-bold leading-[0.94] tracking-[-0.035em] motion-safe:animate-[guest-welcome-in_300ms_ease-out] ${guestNameSizeClass(welcome.displayName)}`}>
                  {welcome.displayName}
                </h2>
              </div>
            ) : null}
            <p className={`${welcome.displayName ? "mt-[clamp(1rem,3vh,2.25rem)]" : "mt-[clamp(1.5rem,5vh,4rem)]"} mx-auto w-full text-center text-[clamp(1.65rem,3.7vw,3.6rem)] font-semibold leading-tight text-white/90`}>
              {doorWelcomeGuestCount(welcome.quantityCheckedIn)}
            </p>
            {welcome.assignedSeatLabels.length > 0 ? (
              <div className="mx-auto mt-[clamp(1.25rem,3.5vh,3rem)] flex max-w-full flex-col items-center border-t text-center border-[#d5aa42]/50 px-[clamp(1rem,5vw,4rem)] pt-[clamp(0.75rem,2vh,1.5rem)] motion-safe:animate-[seats-in_300ms_ease-out_120ms_both]">
                <h2 className="text-[clamp(1rem,1.8vw,1.75rem)] font-semibold text-[#e2bc59]">
                  Reserved {welcome.assignedSeatLabels.length === 1 ? "Seat" : "Seats"}
                </h2>
                <div className="mx-auto mt-2 flex max-w-[92vw] flex-col items-center gap-1 text-center text-[clamp(1.9rem,4.5vw,4.5rem)] font-bold leading-tight tracking-wide">
                  {chunkDoorWelcomeSeats(welcome.assignedSeatLabels).map((line, lineIndex) => (
                    <p key={`${welcome.timestamp}-seat-line-${lineIndex}`} className="max-w-full text-balance [overflow-wrap:anywhere]">
                      {line.join(" • ")}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="mx-auto mt-[clamp(1rem,3vh,2.5rem)] w-full text-center text-[clamp(1.1rem,2vw,1.9rem)] font-medium tracking-wide text-[#e2bc59]">
              Enjoy the Show!
            </p>
          </section>
        ) : null}
      </div>

      <style jsx global>{`
        @keyframes logo-swap-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes idle-message-in {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes guest-welcome-in {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes guest-spotlight {
          0% { opacity: 0; }
          12% { opacity: 1; }
          75% { opacity: 0.7; }
          100% { opacity: 0; }
        }
        @keyframes venue-gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes seats-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            scroll-behavior: auto !important;
            animation-duration: 0.01ms !important;
            animation-delay: 0ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </main>
  );
}
