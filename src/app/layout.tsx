import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Baloo_2 } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

import { themeToggle } from "@/lib/theme";

const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
});

const departureMono = localFont({
  src: "./fonts/DepartureMono-Regular.woff2",
  variable: "--font-departure",
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Atlas",
  description: "See what your words can do.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1f23" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${atkinson.variable} ${baloo.variable} ${departureMono.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeToggle }} />
      </head>
      <body className="flex min-h-dvh flex-col bg-sand text-ink">
        {children}
      </body>
    </html>
  );
}
