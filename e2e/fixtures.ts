import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Shared fixtures for the end-to-end contribution loop.
//
// ⚠️ Everything here WRITES: it creates admin accounts, inserts submissions,
// and approves them into `products`. playwright.config.ts refuses to start
// unless E2E_ALLOW_WRITES=1 and the target is not the production project.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function requireAdminEnv(): void {
  for (const [name, value] of [
    ["NEXT_PUBLIC_SUPABASE_URL", url],
    ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
  ] as const) {
    if (!value) throw new Error(`${name} is required for the E2E suite.`);
  }
}

/**
 * Deterministic OCR.
 *
 * Real Tesseract in a Web Worker needs ~10 MB of traineddata, takes seconds per
 * image, and returns text that differs run to run — none of which can support an
 * assertion of an exact verdict. This installs a stub worker through the seam in
 * src/lib/ocr/tesseract.ts, which is honoured only outside production builds.
 *
 * The scan flow calls recognize() for the front label first and the ingredients
 * panel second, so the stub answers in that order.
 */
export async function installOcrStub(
  page: Page,
  opts: { frontText: string; backText: string; meanConfidence?: number }
): Promise<void> {
  const { frontText, backText, meanConfidence = 0.9 } = opts;
  await page.addInitScript(
    ({ frontText, backText, meanConfidence }: typeof opts) => {
      const texts = [frontText, backText];
      let calls = 0;
      (window as unknown as { __SHF_OCR_WORKER_FACTORY__: () => unknown }).__SHF_OCR_WORKER_FACTORY__ =
        () => ({
          onmessage: null as ((ev: { data: unknown }) => void) | null,
          postMessage(this: { onmessage: ((ev: { data: unknown }) => void) | null }, msg: unknown) {
            const m = msg as { id: string; type: string };
            if (m.type !== "recognize") return;
            const id = m.id;
            const text = texts[Math.min(calls++, texts.length - 1)];
            const post = (data: unknown) => this.onmessage?.({ data });
            setTimeout(
              () =>
                post({
                  id,
                  type: "progress",
                  progress: { phase: "recognizing", label: "Reading text…", progress: 0.6 },
                }),
              5
            );
            setTimeout(
              () =>
                post({
                  id,
                  type: "result",
                  payload: { text, meanConfidence, isTruncated: false, blocks: [] },
                }),
              30
            );
          },
          terminate() {},
        });
    },
    { frontText, backText, meanConfidence }
  );
}

/**
 * A real 1x1 PNG. The scan flow runs every capture through downscaleBlob(), which
 * decodes with the browser's image pipeline and re-encodes via canvas — so the
 * fixture must be a genuinely decodable image, not an arbitrary buffer.
 */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/**
 * Create (or reuse) an admin account and return its credentials.
 *
 * Uses the service-role admin API because the reviewer role is invite-only by
 * design (04_BACKEND_STRUCTURE.md) — there is no public admin sign-up.
 */
export async function ensureAdmin(): Promise<{ email: string; password: string }> {
  requireAdminEnv();
  const email = process.env.E2E_ADMIN_EMAIL ?? "e2e-reviewer@shf.test";
  const password = process.env.E2E_ADMIN_PASSWORD ?? "E2eReviewer!2026";

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Reuse if the account already exists; otherwise create it.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  let userId = created?.user?.id;
  if (createError) {
    const already = /already|registered|exists/i.test(createError.message);
    if (!already) throw new Error(`Could not create E2E admin: ${createError.message}`);

    // Look the existing user up so the role can still be (re)asserted.
    const page = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    userId = page.data?.users?.find((u) => u.email === email)?.id;
    if (!userId) throw new Error(`E2E admin ${email} exists but could not be found.`);
  }

  const { error: roleError } = await admin
    .from("profiles")
    .upsert({ id: userId, role: "admin" }, { onConflict: "id" });
  if (roleError) throw new Error(`Could not elevate E2E admin: ${roleError.message}`);

  return { email, password };
}

/**
 * Sign in through the real UI, so the auth path under test is the actual one.
 *
 * Selectors come from `LoginForm`: the fields are `#login-email` /
 * `#login-password` (custom <Field label> wrappers, not <label for> pairs), and
 * the submit button reads "Login" — not "Sign in", which is the obvious guess and
 * is wrong. The page's default `next` target is /guest-dashboard, so a successful
 * sign-in leaves /login behind.
 */
export async function signIn(page: Page, creds: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.locator("#login-email").fill(creds.email);
  await page.locator("#login-password").fill(creds.password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

/**
 * Drive the capture flow through the Gallery fallback.
 *
 * There is no camera in CI, and the file-upload path is the documented
 * accessible alternative anyway (03_FRONTEND_ARCHITECTURE.md §8), so this
 * exercises a real user path rather than a test-only shortcut.
 */
export async function captureLabel(page: Page, image: Buffer = TINY_PNG): Promise<void> {
  const input = page.locator('input[type="file"]').first();
  await expect(input).toHaveCount(1);
  await input.setInputFiles({ name: "label.png", mimeType: "image/png", buffer: image });
}
