"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GetStartedLinkProps = {
  /** Runs only for real user clicks, before the Link navigates. */
  onNavigate?: () => void;
  className?: string;
};

export function GetStartedLink({
  onNavigate,
  className,
}: GetStartedLinkProps) {
  return (
    <Button
      nativeButton={false}
      render={
        <Link
          href="/start"
          data-cta-button
          transitionTypes={["nav-forward"]}
          onNavigate={() => onNavigate?.()}
        />
      }
      className={cn("h-12 rounded-full px-6 text-base font-semibold", className)}
    >
      Get Started
    </Button>
  );
}
