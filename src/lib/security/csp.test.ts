// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../../next.config";

// Regression guard for the production CSP (next.config.ts).
//
// A production build once shipped with `script-src 'self' 'wasm-unsafe-eval'`.
// The App Router streams its RSC payload through inline
// `<script>self.__next_f.push(…)</script>` tags, so the browser blocked every
// one of them, React never received the streamed payload, and hydration died
// with "Connection closed" (React #412) — the page rendered but was completely
// inert. These assertions pin the directives whose absence breaks the app, and
// the hardening that must NOT be traded away to fix it.
//
// If this fails, do not simply delete it: a red test here means a real
// deployment is about to be broken for every user.

async function productionHeaders(): Promise<Record<string, string>> {
  vi.stubEnv("NODE_ENV", "production");
  const rules = (await nextConfig.headers?.()) ?? [];
  const rule = rules.find((entry) => entry.source === "/(.*)");
  expect(rule, "the global /(.*) header rule is missing").toBeTruthy();
  return Object.fromEntries((rule?.headers ?? []).map((h) => [h.key, h.value]));
}

/** The value of a single CSP directive, e.g. directive(csp, "script-src"). */
function directive(csp: string, name: string): string {
  return (
    csp
      .split(";")
      .map((part) => part.trim())
      .find((part) => part === name || part.startsWith(`${name} `)) ?? ""
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("production Content-Security-Policy", () => {
  it("allows the inline scripts the App Router needs to hydrate", async () => {
    const csp = (await productionHeaders())["Content-Security-Policy"];
    expect(csp).toBeTruthy();
    expect(directive(csp, "script-src")).toContain("'unsafe-inline'");
  });

  it("allows the Vercel Toolbar and its realtime channel", async () => {
    const csp = (await productionHeaders())["Content-Security-Policy"];
    expect(directive(csp, "script-src")).toContain("https://vercel.live");
    expect(directive(csp, "connect-src")).toContain("https://vercel.live");
    expect(directive(csp, "connect-src")).toContain("wss://ws-us3.pusher.com");
    expect(directive(csp, "frame-src")).toContain("https://vercel.live");
  });

  it("keeps the hardening it is not allowed to trade away", async () => {
    const csp = (await productionHeaders())["Content-Security-Policy"];
    expect(directive(csp, "default-src")).toContain("'self'");
    expect(directive(csp, "script-src")).toContain("'wasm-unsafe-eval'");
    expect(directive(csp, "worker-src")).toContain("blob:");
    expect(directive(csp, "frame-ancestors")).toContain("'none'");
    expect(directive(csp, "base-uri")).toContain("'self'");
    expect(directive(csp, "form-action")).toContain("'self'");
  });

  it("omits the headers outside production (dev hot-reload needs eval)", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    expect(rules).toHaveLength(0);
  });
});
