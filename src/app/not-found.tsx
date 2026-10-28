import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { NotFoundScene } from "@/components/ui/not-found-scene";

export default function NotFound() {
  return (
    <main className="page-gutter relative flex flex-1 flex-col items-center justify-center bg-sand pt-[clamp(2rem,6vh,4rem)] pb-[max(clamp(2rem,6vh,4rem),env(safe-area-inset-bottom))]">
      <NotFoundScene />

      <div className="relative z-10 mt-6 flex max-w-full flex-col items-center text-center font-mono sm:mt-12">
        <h1 className="text-[clamp(1.25rem,5.5vw,2.0625rem)] leading-none tracking-tight text-ink">
          <span className="text-sage">404</span> : Page not found
        </h1>

        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-ink-muted sm:mt-5 sm:text-base">
          This page does not exist or may have been moved.
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex h-12 items-center gap-2 rounded-full border border-line bg-paper px-5 text-sm text-ink transition-colors hover:border-sage/40 hover:bg-sage-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:mt-10 sm:text-base"
        >
          <ArrowLeft className="size-4" strokeWidth={2} />
          Return home
        </Link>
      </div>
    </main>
  );
}
