import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(), microphone=()" },
  // Tesseract needs 'wasm-unsafe-eval' (compiles WASM) but this does NOT
  // permit JS eval(). worker-src 'blob:' allows the OCR worker + tesseract's
  // blob-backed nested worker. All OCR assets are self-hosted under
  // /vendor/tesseract so CSP stays on ~self~.
  { key: "Content-Security-Policy", value: [
      "default-src 'self'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "connect-src 'self' https://*.supabase.co",
      "worker-src 'self' blob:",
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