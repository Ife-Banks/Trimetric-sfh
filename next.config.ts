import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(), microphone=()" },
  // SEC-12: HTTPS enforced everywhere; HSTS set. Was missing entirely — the
  // spec lists it but it had never been added. `preload` is deliberately NOT
  // set: submitting a domain to the HSTS preload list is effectively
  // irreversible and is an operational decision, not a code one.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Tesseract needs 'wasm-unsafe-eval' (compiles WASM) but this does NOT
  // permit JS eval(). worker-src 'blob:' allows the OCR worker + tesseract's
  // blob-backed nested worker. All OCR assets are self-hosted under
  // /vendor/tesseract so CSP stays on ~self~.
  //
  // 'unsafe-inline' in script-src is REQUIRED, not incidental. The App Router
  // streams the RSC payload through inline `<script>self.__next_f.push(…)</script>`
  // tags. With script-src 'self' the browser blocks them, React never receives
  // the streamed payload, hydration dies with "Connection closed" (React #412),
  // and the page renders but is completely inert. Next only avoids this with a
  // per-request nonce, which requires middleware and forces dynamic rendering —
  // a trade-off we have deliberately not taken. script-src still pins scripts to
  // our own origin plus the Vercel Toolbar (preview-only); there is no
  // dangerouslySetInnerHTML anywhere and CI greps to keep it that way.
  { key: "Content-Security-Policy", value: [
      "default-src 'self'",
      "img-src 'self' data: blob: https://*.supabase.co https://vercel.live https://vercel.com",
      "style-src 'self' 'unsafe-inline' https://vercel.live",
      "font-src 'self' https://vercel.live https://assets.vercel.com",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://vercel.live",
      // wss://ws-us3.pusher.com is the Vercel Toolbar's realtime channel;
      // vercel.live serves its feedback script. Both are preview-only, but the
      // header is emitted on every production build (including previews).
      "connect-src 'self' https://*.supabase.co https://vercel.live wss://ws-us3.pusher.com",
      "worker-src 'self' blob:",
      "frame-src https://vercel.live",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    // Applies in dev too; skip in dev so hot-reload/eval source maps don't
    // trip CSP. Production hardening is finalised in Phase 7.
    if (process.env.NODE_ENV !== "production") return [];
    return [{ source: "/(.*)", headers: [...securityHeaders] }];
  },
};

export default nextConfig;