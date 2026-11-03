/**
 * Shared character illustrations, extracted verbatim from the site header.
 *
 * The wheelchair user and the blind walker are the same SVGs (and the same
 * cyclic utilities: wheel spin, bob, stride, cane sweep) on the homepage and
 * in the demo intro — one source, no redrawn illustration. The header keeps
 * its own positioning wrappers; callers size the art with `className`.
 */
import { cn } from "@/lib/utils";

function ArtShell({
  className,
  bobClass,
  children,
}: {
  className?: string;
  bobClass: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex", bobClass)}>
      <svg
        viewBox="0 0 36 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className ?? "h-8 w-9"}
        focusable="false"
        aria-hidden="true"
      >
        {children}
      </svg>
    </span>
  );
}

/** Wheelchair user, facing right. Wheels spin, body bobs on push strokes. */
export function WheelchairUser({ className }: { className?: string }) {
  return (
    <ArtShell
      className={className}
      bobClass="animate-commute-bob motion-reduce:animate-none"
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
      {/* rear wheel: bold tire ring + handrim + spokes */}
      <circle cx="13" cy="22" r="8" strokeWidth="3.2" />
      <circle
        cx="13"
        cy="22"
        r="6.2"
        strokeWidth="1"
        opacity="0.7"
      />
      <g
        className="animate-commute-spin motion-reduce:animate-none [transform-box:fill-box] origin-center"
        strokeWidth="1.1"
        opacity="0.9"
      >
        <path d="M13 22L19.5 22M13 22L16.3 27.6M13 22L9.8 27.6M13 22L6.5 22M13 22L9.8 16.4M13 22L16.3 16.4" />
      </g>
      <circle cx="13" cy="22" r="1.5" fill="currentColor" stroke="none" />
      {/* frame */}
      <path d="M13 22L26 14.8M13 22L14.5 14" strokeWidth="2" />
      {/* seat + backrest + push handle */}
      <rect
        x="14"
        y="12.4"
        width="12.5"
        height="3.2"
        rx="1.6"
        fill="currentColor"
        stroke="none"
      />
      <path d="M14 13.5L12.6 6.8" strokeWidth="2.6" />
      <path d="M12.6 6.8H10.4" strokeWidth="2" />
      {/* footrest + caster */}
      <path d="M26 14.8L29 21.5" strokeWidth="2" />
      <path d="M27.8 21.8H32" strokeWidth="1.8" />
      <path d="M29.5 21.8L30.5 24.5" strokeWidth="1.8" />
      <circle cx="30.5" cy="26.5" r="2.2" strokeWidth="2.2" />
      <g className="animate-commute-spin-fast motion-reduce:animate-none [transform-box:fill-box] origin-center" strokeWidth="1.1">
        <path d="M30.5 24.7V28.3" />
      </g>
      <circle
        cx="30.5"
        cy="26.5"
        r="0.8"
        fill="currentColor"
        stroke="none"
      />
      {/* rider: legs + shoe */}
      <path
        d="M19 12.5L26 14"
        stroke="#3f3a33"
        strokeWidth="3.4"
      />
      <path
        d="M26 14L28.5 20.3"
        stroke="#3f3a33"
        strokeWidth="3"
      />
      <rect
        x="28"
        y="19.7"
        width="4.9"
        height="2.4"
        rx="1.2"
        fill="#2b2b2b"
        stroke="none"
        transform="rotate(12 30 21)"
      />
      {/* rider: torso */}
      <path
        d="M19 12.5L23.5 5.8"
        stroke="#4a7c6f"
        strokeWidth="4.4"
      />
      {/* rider: arm reaching to the handrim */}
      <path
        d="M23 6.2L18.2 10L14.6 13.2"
        stroke="#d99e73"
        strokeWidth="2.4"
      />
      <circle
        cx="14.4"
        cy="13.4"
        r="1.6"
        fill="#d99e73"
        stroke="none"
      />
      {/* rider: head + hair */}
      <circle cx="24.8" cy="2.6" r="2.8" fill="#d99e73" stroke="none" />
      <path
        d="M22.3 2.2a2.6 2.6 0 0 1 5 0.4"
        stroke="#2b2b2b"
        strokeWidth="2"
      />
    </ArtShell>
  );
}

/** Blind walker with sweeping white cane and dark glasses, facing right. */
export function BlindWalker({ className }: { className?: string }) {
  return (
    <ArtShell
      className={className}
      bobClass="animate-walker-bob motion-reduce:animate-none"
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
      <g className="animate-step-a motion-reduce:animate-none" stroke="#3f3a33" strokeWidth="3.1">
        <path d="M17 20L22 26.4" />
        <path d="M22 26.4L24.4 26.6" strokeWidth="2.6" />
        <path d="M17 20L13.2 26.2" />
        <path d="M13.2 26.2L15.2 26.8" strokeWidth="2.6" />
        <path
          d="M18.6 11.8L15 17.2"
          stroke="#d99e73"
          strokeWidth="2.2"
        />
      </g>
      {/* stride pose B (passing): legs together, free arm forward */}
      <g className="animate-step-b motion-reduce:animate-none motion-reduce:opacity-0" stroke="#3f3a33" strokeWidth="3.1">
        <path d="M17 20L15.8 27.2" />
        <path d="M15.8 27.2L18 27.4" strokeWidth="2.6" />
        <path d="M17 20L19.2 27.2" />
        <path d="M19.2 27.2L21.4 27" strokeWidth="2.6" />
        <path
          d="M18.6 11.8L20.8 16"
          stroke="#d99e73"
          strokeWidth="2.2"
        />
      </g>
      {/* torso */}
      <path
        d="M17 20.2L19 11"
        stroke="#b07a4a"
        strokeWidth="3.9"
      />
      {/* cane arm reaching to the grip */}
      <path
        d="M19 11.6L23.6 14.6"
        stroke="#d99e73"
        strokeWidth="2.2"
      />
      <circle cx="23.8" cy="14.8" r="1.5" fill="#d99e73" stroke="none" />
      {/* sweeping white cane with red tip */}
      <g className="animate-cane-sweep motion-reduce:animate-none [transform-box:fill-box] origin-[50%_0%]">
        <path d="M23.8 14.8L33 28.5" strokeWidth="2.5" />
        <path
          d="M23.8 14.8L33 28.5"
          stroke="#fbf8f2"
          strokeWidth="1.5"
        />
        <path d="M30.4 24.6L33 28.5" strokeWidth="2.5" />
        <path
          d="M30.4 24.6L33 28.5"
          stroke="#c4553e"
          strokeWidth="1.5"
        />
      </g>
      {/* head + dark glasses + hair */}
      <circle cx="20" cy="6.4" r="2.8" fill="#d99e73" stroke="none" />
      <rect
        x="19.3"
        y="5.3"
        width="5"
        height="2.1"
        rx="1.05"
        fill="#2b2b2b"
        stroke="none"
      />
      <path
        d="M17.5 6a2.6 2.6 0 0 1 4.6-1.6"
        stroke="#2b2b2b"
        strokeWidth="2"
      />
    </ArtShell>
  );
}
