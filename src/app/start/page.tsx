import type { Metadata } from "next";
import { ViewTransition } from "react";

import { AmbientBackdrop } from "@/components/layout/ambient-backdrop";
import { StartFlow } from "@/components/start/start-flow";
import { routeTransition } from "@/lib/view-transition";

export const metadata: Metadata = {
  title: "Get started — Atlas",
  description:
    "A few quick questions so Atlas can match your voice, pace, and tone.",
};

export default function StartPage() {
  return (
    <ViewTransition {...routeTransition}>
      <main className="page-gutter relative isolate flex min-h-dvh flex-1 items-center justify-center overflow-x-clip bg-sand pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <AmbientBackdrop />

        <StartFlow />
      </main>
    </ViewTransition>
  );
}
