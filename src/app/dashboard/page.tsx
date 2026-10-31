import type { Metadata } from "next";
import { ViewTransition } from "react";

import { DashboardFlow } from "@/components/dashboard/dashboard-flow";
import { AdaptiveContainer } from "@/components/layout/adaptive-container";
import { OrbBackdrop } from "@/components/dashboard/orb-stage";
import { routeTransition } from "@/lib/view-transition";

export const metadata: Metadata = {
  title: "Dashboard — Atlas",
  description: "The Atlas orb: particles that turn, breathe and answer your voice.",
};

export default function DashboardPage() {
  return (
    <ViewTransition {...routeTransition}>
      <main className="page-gutter relative isolate flex min-h-[calc(100dvh-1rem)] flex-1 items-center justify-center overflow-x-clip bg-sand py-2">
        <AdaptiveContainer>
          <OrbBackdrop />
          <DashboardFlow />
        </AdaptiveContainer>
      </main>
    </ViewTransition>
  );
}
