import Link from "next/link";

import { GetStartedLink } from "@/components/layout/get-started-link";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full bg-sand/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="page-gutter mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 md:h-20">
        <div className="flex min-w-0 items-center gap-6 md:gap-8">
          <Link
            href="/"
            aria-label="Atlas home"
            className="inline-flex min-h-11 items-center rounded-sm font-display text-2xl leading-none font-bold tracking-tight text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            Atlas
          </Link>

          <nav
            aria-label="Main navigation"
            className="hidden items-center md:flex"
          >
            <Link
              href="/"
              aria-current="page"
              className="inline-flex min-h-11 items-center rounded-full bg-sage-wash px-5 text-lg font-bold text-sage-text transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Home
            </Link>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <ThemeToggle />

          <div className="hidden md:block">
            <div data-cta-frame className="relative will-change-transform">
              <GetStartedLink />
            </div>
          </div>

          <MobileNav />
        </div>
      </div>
    </header>
  );
}
