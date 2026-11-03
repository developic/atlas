import { Download } from "lucide-react";

import { BlindWalker, WheelchairUser } from "@/components/characters";
import { ParticlesOrb } from "@/registry/orbe/particles-orb/particles-orb";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full bg-transparent px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="relative mx-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-full border border-line/60 bg-paper/90 py-2 pr-2 pl-4 shadow-[0_12px_40px_-16px_rgba(43,43,43,0.25)] backdrop-blur-md sm:pl-5">
        <a
          href="/"
          aria-label="Atlas home"
          className="inline-flex min-h-11 items-center gap-2 rounded-full font-display text-2xl leading-none font-bold tracking-tight text-ink"
        >
          <span aria-hidden="true" className="block size-13 shrink-0">
            <ParticlesOrb
              state="thinking"
              size={52}
              colorFrom="#2b2b2b"
              colorTo="#4a7c6f"
              label="Atlas orb"
            />
          </span>
          Atlas.
        </a>
        <span
          aria-hidden="true"
          className="animate-commute-rider absolute top-1/2 left-36 -mt-4 hidden w-9 text-ink motion-reduce:animate-none md:inline-flex"
        >
          <WheelchairUser />
        </span>
        <span
          aria-hidden="true"
          className="animate-commute-walker absolute top-1/2 left-36 -mt-4 hidden w-9 text-ink motion-reduce:hidden md:inline-flex"
        >
          <BlindWalker />
        </span>
        <span
          aria-hidden="true"
          className="animate-commute-autism absolute top-1/2 left-36 -mt-4 hidden w-9 text-ink motion-reduce:hidden md:inline-flex"
        >
          <span className="animate-dance-bob inline-flex motion-reduce:animate-none">
            <svg
              viewBox="0 0 36 32"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-8 w-9"
              focusable="false"
            >
              <ellipse
                cx="21"
                cy="29.6"
                rx="10"
                ry="1.3"
                fill="currentColor"
                stroke="none"
                opacity="0.12"
              />
              {/* dance pose A: left arm high, right arm low, wide stance */}
              <g className="animate-dance-a motion-reduce:animate-none" stroke="#3f3a33" strokeWidth="2.8">
                <path d="M17 20L13.5 26.5" />
                <path d="M13.5 26.5L15.7 26.9" strokeWidth="2.2" />
                <path d="M17 20L20.5 26.8" />
                <path d="M20.5 26.8L22.7 26.4" strokeWidth="2.2" />
                <path
                  d="M18.6 11.8L15.5 6.5"
                  stroke="#d99e73"
                  strokeWidth="2"
                />
                <circle cx="15.2" cy="6" r="1.4" fill="#d99e73" stroke="none" />
                <path
                  d="M18.6 11.8L21.2 16.3"
                  stroke="#d99e73"
                  strokeWidth="2"
                />
              </g>
              {/* dance pose B: right arm high, left arm low, feet together */}
              <g className="animate-dance-b motion-reduce:animate-none motion-reduce:opacity-0" stroke="#3f3a33" strokeWidth="2.8">
                <path d="M17 20L15.2 27" />
                <path d="M15.2 27L17.4 27.2" strokeWidth="2.2" />
                <path d="M17 20L19.4 26.8" />
                <path d="M19.4 26.8L21.6 26.4" strokeWidth="2.2" />
                <path
                  d="M18.6 11.8L22.2 6.6"
                  stroke="#d99e73"
                  strokeWidth="2"
                />
                <circle cx="22.5" cy="6" r="1.4" fill="#d99e73" stroke="none" />
                <path
                  d="M18.6 11.8L16.3 16.2"
                  stroke="#d99e73"
                  strokeWidth="2"
                />
              </g>
              {/* torso */}
              <path
                d="M17 20.2L19 11"
                stroke="#9a8fd0"
                strokeWidth="3.6"
              />
              {/* head + hair + calm face */}
              <circle cx="20" cy="6.4" r="2.6" fill="#d99e73" stroke="none" />
              <path
                d="M17.5 6a2.6 2.6 0 0 1 4.6-1.6"
                stroke="#2b2b2b"
                strokeWidth="1.8"
              />
              <circle cx="22.1" cy="6.4" r="0.55" fill="#2b2b2b" stroke="none" />
              <path
                d="M21.4 8.3q1 0.7 2 0.2"
                stroke="#2b2b2b"
                strokeWidth="1.2"
              />
              {/* noise-cancelling headphones with cushion */}
              <path
                d="M17.2 7.8C16.9 0.8 21.3 0.6 21.1 5.2"
                stroke="#2b2b2b"
                strokeWidth="2.2"
              />
              <rect
                x="18.8"
                y="5.8"
                width="2.4"
                height="3.2"
                rx="1.2"
                fill="#4a7c6f"
                stroke="none"
              />
              <rect
                x="19.3"
                y="6.5"
                width="1.4"
                height="1.8"
                rx="0.7"
                fill="#3e6a5e"
                stroke="none"
              />
            </svg>
          </span>
        </span>
        <div data-cta-frame className="relative will-change-transform">
          <a
            href="/start"
            data-cta-button
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-white transition-transform"
          >
            Get Atlas
            <Download aria-hidden="true" className="size-4" strokeWidth={2.25} />
          </a>
        </div>
      </div>
    </header>
  );
}
