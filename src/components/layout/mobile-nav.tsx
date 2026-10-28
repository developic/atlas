"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Drawer } from "@base-ui/react/drawer";
import { Menu, X } from "lucide-react";

import { GetStartedLink } from "@/components/layout/get-started-link";

const DESKTOP_QUERY = "(min-width: 768px)";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  // The trigger disappears at md; make sure a resize can't leave the panel open.
  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setOpen(false);
      }
    };

    desktop.addEventListener("change", handleChange);

    return () => desktop.removeEventListener("change", handleChange);
  }, []);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(nextOpen) => setOpen(nextOpen)}
      swipeDirection="right"
    >
      <Drawer.Trigger
        aria-label="Open menu"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-sage-wash text-ink transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:hidden"
      >
        <Menu aria-hidden="true" className="size-5" strokeWidth={2} />
      </Drawer.Trigger>

      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-[60] min-h-dvh bg-ink/30 transition-opacity duration-300 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none dark:bg-black/70" />
        <Drawer.Viewport className="fixed inset-0 z-[61] flex justify-end [--viewport-padding:0px]">
          <Drawer.Popup className="h-full w-[min(20rem,calc(100vw-3rem))] touch-auto overflow-y-auto overscroll-contain border-l border-line bg-paper shadow-2xl outline-none [transform:translateX(var(--drawer-swipe-movement-x))] transition-transform duration-300 ease-out data-ending-style:[transform:translateX(100%)] data-starting-style:[transform:translateX(100%)] motion-reduce:transition-none">
            <Drawer.Content className="flex min-h-full flex-col p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Drawer.Title className="font-display text-2xl font-bold tracking-tight text-ink">
                    Menu
                  </Drawer.Title>
                  <Drawer.Description className="mt-1 text-sm leading-relaxed text-ink-muted">
                    Go home or start with Atlas.
                  </Drawer.Description>
                </div>

                <Drawer.Close
                  aria-label="Close menu"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-sage-wash text-ink transition-colors hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <X aria-hidden="true" className="size-5" strokeWidth={2} />
                </Drawer.Close>
              </div>

              <nav aria-label="Mobile navigation" className="mt-8">
                <Link
                  href="/"
                  aria-current="page"
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-12 w-full items-center rounded-full bg-sage-wash px-5 text-lg font-bold text-sage-text transition-colors hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Home
                </Link>
              </nav>

              <div className="mt-auto pt-8">
                <GetStartedLink
                  onNavigate={() => setOpen(false)}
                  className="w-full"
                />

                <p className="mt-3 text-center text-xs leading-relaxed text-ink-muted">
                  A few short questions to get you started.
                </p>
              </div>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
