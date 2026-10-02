import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { BottomNav } from "@/components/layout/BottomNav";
import { MobileOnlyGate } from "@/components/layout/MobileOnlyGate";
import { Toaster } from "@/components/layout/Toaster";
import { ServiceWorkerRegister } from "@/components/layout/ServiceWorkerRegister";
import "./globals.css";

// Inter is the GMO CHECK face (Figma `bobby`) and now backs --font-sans, so
// every screen inherits it. Geist survives as the mono face only.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // MUTAGENIC is the umbrella brand; "GMO Check" and "Fluoride Scan" are its
  // two flows, so the app name is the umbrella and the flows are named on their
  // own screens.
  title: "MUTAGENIC — Scan, read, decide",
  description:
    "Point your camera at a product label to get a plain-language GMO or fluoride verdict, with a separate confidence rating.",
  applicationName: "Mutagenic",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Mutagenic",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Literal hexes are CORRECT here and must not be tokenised. Next.js resolves
  // themeColor at build time into a <meta name="theme-color"> tag; there is no
  // runtime stylesheet for a CSS variable to reach. These must stay in sync with
  // --background in globals.css by hand — that is why they are the only two raw
  // values allowed outside the palette.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8ff" }, // == --background
    { media: "(prefers-color-scheme: dark)", color: "#0b1614" }, // == --background (dark)
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-sm focus:ring-2 focus:ring-ring"
        >
          Skip to content
        </a>
        {/* The app shell is a single wrapper so the mobile-only rule can hide
            all of it — pages, header and tab bar — with one declaration
            (globals.css, `[data-app-shell]`). It carries the flex-column
            behaviour the pages previously got by being direct children of
            <body>. */}
        <div data-app-shell className="flex min-h-full flex-1 flex-col">
          {children}
          {/* Rendered AFTER the page, not before it. BottomNav is position:fixed,
              but it also emits a same-height spacer in normal flow to reserve
              room at the end of the document. Placed before the content that
              spacer reserved nothing, so the last row of every page that shows
              the tab bar sat underneath it. */}
          <BottomNav />
        </div>
        <MobileOnlyGate />
        <Toaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
