import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-black text-white">
      <Image
        src="/stageflow-landing-hero.png"
        alt="Cumberland Mountain Music Show stage and audience"
        fill
        sizes="100vw"
        className="-z-40 object-cover object-center brightness-[1.22] saturate-[1.16] contrast-[1.04]"
        priority
        quality={95}
      />
      <div className="absolute inset-0 -z-30 bg-[radial-gradient(circle_at_50%_38%,rgba(0,0,0,0)_0%,rgba(0,0,0,0.08)_46%,rgba(0,0,0,0.48)_100%)]" />
      <div className="absolute inset-0 -z-30 bg-gradient-to-r from-black/72 via-black/28 to-black/8" />
      <div className="absolute inset-0 -z-30 bg-gradient-to-t from-black/58 via-transparent to-black/18" />
      <div className="pointer-events-none absolute inset-0 -z-20 shadow-[inset_0_0_130px_rgba(0,0,0,0.72)]" />
      <div className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-full max-w-5xl bg-[radial-gradient(circle_at_28%_45%,rgba(20,184,166,0.16),transparent_32%),radial-gradient(circle_at_16%_72%,rgba(59,130,246,0.16),transparent_30%)]" />

      <section className="relative flex min-h-dvh w-full items-center px-5 py-10 sm:px-8 lg:px-14 xl:px-20">
        <div className="w-full max-w-4xl pt-10 sm:pt-0">
          <div className="max-w-3xl rounded-[2rem] border border-white/12 bg-black/18 px-5 py-6 shadow-[0_34px_110px_-60px_rgba(0,0,0,0.95)] backdrop-blur-[2px] sm:px-8 sm:py-8 lg:bg-black/12">
            <Image
              src="/stageflow-logo-v2.png"
              alt="StageFlow"
              width={1040}
              height={259}
              sizes="(min-width: 1024px) 620px, (min-width: 640px) 560px, calc(100vw - 64px)"
              className="h-auto w-full max-w-[39rem] object-contain drop-shadow-[0_20px_62px_rgba(34,211,238,0.26)]"
              priority
            />

            <h1 className="mt-8 text-5xl font-black leading-[0.9] tracking-normal text-white drop-shadow-[0_14px_34px_rgba(0,0,0,0.65)] sm:text-7xl lg:text-8xl">
              StageFlow
            </h1>
            <p className="mt-6 max-w-3xl text-xl font-semibold leading-8 text-cyan-50 drop-shadow-[0_10px_24px_rgba(0,0,0,0.55)] sm:text-2xl">
              Live Show Management for Cumberland Mountain Music Show
            </p>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-200 drop-shadow-[0_8px_20px_rgba(0,0,0,0.7)] sm:text-lg">
              Everything you need to run a live show-from tickets and scripts to Live Mode and the final encore.
            </p>

            <div className="mt-9 flex flex-col items-start gap-5">
              <Link
                href="/shows"
                className="group relative inline-flex min-h-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-emerald-300 via-cyan-200 to-indigo-300 px-9 py-4 text-base font-black uppercase tracking-[0.18em] text-slate-950 shadow-[0_0_42px_-12px_rgba(45,212,191,0.95),0_24px_70px_-38px_rgba(79,70,229,0.9)] transition hover:scale-[1.015] focus:outline-none focus:ring-2 focus:ring-cyan-100 focus:ring-offset-2 focus:ring-offset-black"
              >
                <span className="absolute inset-0 translate-x-[-120%] bg-gradient-to-r from-transparent via-white/55 to-transparent transition duration-700 group-hover:translate-x-[120%]" />
                <span className="relative">ENTER STAGEFLOW</span>
              </Link>
              <p className="max-w-2xl text-sm font-medium leading-6 text-slate-300 drop-shadow-[0_8px_18px_rgba(0,0,0,0.75)] sm:text-base">
                Public links for Band, Guest, MC, Live Mode, and Door Mode continue to work directly.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
