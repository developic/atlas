import { Download } from "lucide-react";

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
          <span className="animate-commute-bob inline-flex motion-reduce:animate-none">
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
                cx="19"
                cy="29.8"
                rx="13"
                ry="1.5"
                fill="currentColor"
                stroke="none"
                opacity="0.12"
              />
              {/* rear wheel */}
              <circle cx="13" cy="22" r="8" strokeWidth="2.4" />
              <g
                className="animate-commute-spin motion-reduce:animate-none [transform-box:fill-box] origin-center"
                strokeWidth="0.9"
                opacity="0.85"
              >
                <path d="M13 22L19.5 22M13 22L16.3 27.6M13 22L9.8 27.6M13 22L6.5 22M13 22L9.8 16.4M13 22L16.3 16.4" />
              </g>
              <circle cx="13" cy="22" r="1.2" fill="currentColor" stroke="none" />
              {/* frame */}
              <path d="M13 22L26 14.8M13 22L14.5 14" />
              {/* seat + backrest + push handle */}
              <rect
                x="14"
                y="12.6"
                width="12.5"
                height="2.8"
                rx="1.4"
                fill="currentColor"
                stroke="none"
              />
              <path d="M14 13.5L12.6 6.8" strokeWidth="2.6" />
              <path d="M12.6 6.8H10.4" />
              {/* footrest + caster */}
              <path d="M26 14.8L29 21.5" />
              <path d="M27.8 21.8H32" strokeWidth="1.6" />
              <path d="M29.5 21.8L30.5 24.5" strokeWidth="1.6" />
              <circle cx="30.5" cy="26.5" r="2.2" />
              <g className="animate-commute-spin-fast motion-reduce:animate-none [transform-box:fill-box] origin-center" strokeWidth="1">
                <path d="M30.5 24.7V28.3" />
              </g>
              <circle
                cx="30.5"
                cy="26.5"
                r="0.8"
                fill="currentColor"
                stroke="none"
              />
              {/* rider: legs */}
              <path
                d="M19 12.5L26 14"
                stroke="#3f3a33"
                strokeWidth="3"
              />
              <path
                d="M26 14L28.5 20.3"
                stroke="#3f3a33"
                strokeWidth="2.6"
              />
              <path d="M28.5 20.3L31.5 21.3" strokeWidth="2.4" />
              {/* rider: torso */}
              <path
                d="M19 12.5L23.5 5.8"
                stroke="#4a7c6f"
                strokeWidth="4"
              />
              {/* rider: arm reaching to the handrim */}
              <path
                d="M23 6.2L18.2 10L14.6 13.2"
                stroke="#d99e73"
                strokeWidth="2.2"
              />
              <circle
                cx="14.4"
                cy="13.4"
                r="1.4"
                fill="#d99e73"
                stroke="none"
              />
              {/* rider: head + hair */}
              <circle cx="24.8" cy="2.6" r="2.6" fill="#d99e73" stroke="none" />
              <path
                d="M22.3 2.2a2.6 2.6 0 0 1 5 0.4"
                stroke="#2b2b2b"
                strokeWidth="1.8"
              />
            </svg>
          </span>
        </span>
        <span
          aria-hidden="true"
          className="animate-commute-walker absolute top-1/2 left-36 -mt-4 hidden w-9 text-ink motion-reduce:hidden md:inline-flex"
        >
          <span className="animate-walker-bob inline-flex motion-reduce:animate-none">
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
              {/* stride pose A (contact): legs apart, free arm back */}
              <g className="animate-step-a motion-reduce:animate-none" stroke="#3f3a33" strokeWidth="2.8">
                <path d="M17 20L22 26.4" />
                <path d="M22 26.4L24.4 26.6" strokeWidth="2.2" />
                <path d="M17 20L13.2 26.2" />
                <path d="M13.2 26.2L15.2 26.8" strokeWidth="2.2" />
                <path
                  d="M18.6 11.8L15 17.2"
                  stroke="#d99e73"
                  strokeWidth="2"
                />
              </g>
              {/* stride pose B (passing): legs together, free arm forward */}
              <g className="animate-step-b motion-reduce:animate-none motion-reduce:opacity-0" stroke="#3f3a33" strokeWidth="2.8">
                <path d="M17 20L15.8 27.2" />
                <path d="M15.8 27.2L18 27.4" strokeWidth="2.2" />
                <path d="M17 20L19.2 27.2" />
                <path d="M19.2 27.2L21.4 27" strokeWidth="2.2" />
                <path
                  d="M18.6 11.8L20.8 16"
                  stroke="#d99e73"
                  strokeWidth="2"
                />
              </g>
              {/* torso */}
              <path
                d="M17 20.2L19 11"
                stroke="#b07a4a"
                strokeWidth="3.6"
              />
              {/* cane arm reaching to the grip */}
              <path
                d="M19 11.6L23.6 14.6"
                stroke="#d99e73"
                strokeWidth="2"
              />
              <circle cx="23.8" cy="14.8" r="1.3" fill="#d99e73" stroke="none" />
              {/* sweeping white cane with red tip */}
              <g className="animate-cane-sweep motion-reduce:animate-none [transform-box:fill-box] origin-[50%_0%]">
                <path d="M23.8 14.8L33 28.5" strokeWidth="2.3" />
                <path
                  d="M23.8 14.8L33 28.5"
                  stroke="#fbf8f2"
                  strokeWidth="1.4"
                />
                <path d="M30.4 24.6L33 28.5" strokeWidth="2.3" />
                <path
                  d="M30.4 24.6L33 28.5"
                  stroke="#c4553e"
                  strokeWidth="1.4"
                />
              </g>
              {/* head + dark glasses + hair */}
              <circle cx="20" cy="6.4" r="2.6" fill="#d99e73" stroke="none" />
              <rect
                x="19.4"
                y="5.4"
                width="4.8"
                height="1.9"
                rx="0.95"
                fill="#2b2b2b"
                stroke="none"
              />
              <path
                d="M17.5 6a2.6 2.6 0 0 1 4.6-1.6"
                stroke="#2b2b2b"
                strokeWidth="1.8"
              />
            </svg>
          </span>
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
