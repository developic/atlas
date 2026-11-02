import type { Metadata } from "next";
import { ViewTransition } from "react";

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
      <main aria-labelledby="start-heading" className="page-gutter bg-sand">
        <div className="mx-auto w-full max-w-xl py-[clamp(3rem,8vh,5rem)]">
          <StartFlow />
        </div>
      </main>
    </ViewTransition>
  );
}
