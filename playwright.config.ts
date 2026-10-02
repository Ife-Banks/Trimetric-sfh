import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end config for the full contribution loop:
 *   scan -> low-confidence verdict -> submit -> admin queue -> approve
 *   -> row lands in products -> re-scan returns the stored verdict
 *
 * ⚠️ THIS TEST WRITES TO THE DATABASE. It inserts a submission, approves it,
 * which writes a row into `products`, and promotes a real admin account. It
 * must NEVER point at the production Supabase project.
 *
 * Two guards, because the failure mode is silent data pollution:
 *   1. E2E_ALLOW_WRITES must be exactly "1".
 *   2. The project ref must not equal SHF_PRODUCTION_PROJECT_REF (default: the
 *      ref baked into .env.local.example).
 *
 * Point NEXT_PUBLIC_SUPABASE_URL at a dedicated test project. Per
 * 02_SYSTEM_ARCHITECTURE.md §7, staging must be a separate project from
 * production anyway — this test is the reason that rule exists.
 */

const PRODUCTION_REF = process.env.SHF_PRODUCTION_PROJECT_REF ?? "nmqehjnjdplloaifhtwy";

function assertSafeTarget() {
  if (process.env.E2E_ALLOW_WRITES !== "1") {
    throw new Error(
      "Refusing to run: these tests approve submissions and write to `products`.\n" +
        "Set E2E_ALLOW_WRITES=1 and point NEXT_PUBLIC_SUPABASE_URL at a dedicated\n" +
        "TEST project (not production)."
    );
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1];
  if (!ref) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL is not a hosted Supabase URL: ${url || "(unset)"}`
    );
  }
  if (ref === PRODUCTION_REF) {
    throw new Error(
      `Refusing to run against the PRODUCTION project (${ref}).\n` +
        "These tests write to `products` and create admin accounts. Use a test project."
    );
  }
  return ref;
}

/**
 * Unconditionally. A guard that only runs when its flag is set is not a guard —
 * an earlier version called this only under `E2E_ALLOW_WRITES === "1"`, which
 * meant the common case (flag unset) skipped the check entirely and the suite
 * happily wrote to whatever project `.env.local` happened to point at.
 */
assertSafeTarget();

export default defineConfig({
  testDir: "./e2e",
  // Approving a submission is a multi-step flow touching auth, storage and the
  // admin queue; 60s is generous but keeps a genuine hang from eating the suite.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // These tests share one database and create admin accounts. Running them in
  // parallel would race on the pending-submission cap and the role bootstrap.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // No camera in CI. The scan flow is driven through the Gallery fallback,
    // which is the documented accessible path anyway
    // (03_FRONTEND_ARCHITECTURE.md §8: camera flow has a file-upload fallback).
  },

  // Phone-sized viewport, real Chromium. The app is mobile-only: above 1024px
  // the shell is replaced by the "Switch to a mobile device" notice
  // (src/components/layout/MobileOnlyGate.tsx), so a desktop viewport would
  // test a screen no user is ever meant to reach. Chrome's device emulation
  // flags (isMobile/hasTouch) are deliberately left off — they change the
  // touch/meta-viewport behaviour and are not what the gate keys on.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 402, height: 874 } },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },

  metadata: {},
});
