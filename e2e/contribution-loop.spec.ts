import { test, expect, type Page } from "@playwright/test";
import { installOcrStub, captureLabel, ensureAdmin, signIn, requireAdminEnv } from "./fixtures";

/**
 * The full contribution loop, in the order the product depends on it
 * (06_AGENT_CONTEXT.md §8 Definition of done):
 *
 *   1. scan a packaged food product
 *   2. get a GMO verdict with a SEPARATE confidence badge
 *   3. correct + submit, pre-filled from what the engine read
 *   4. the row appears in the admin queue with a live recompute
 *   5. approving writes `products`
 *   6. re-scanning the same product returns the STORED verdict
 *
 * ⚠️ Steps 3-5 write to the database. playwright.config.ts refuses to run this
 * suite without E2E_ALLOW_WRITES=1 against a non-production project.
 *
 * ── Why OCR is stubbed ─────────────────────────────────────────────────────
 * Real Tesseract in a Web Worker needs ~10 MB of traineddata, takes seconds per
 * image, and returns text that differs run to run — none of which can support an
 * assertion of an exact verdict. The stub goes in through the seam in
 * src/lib/ocr/tesseract.ts (honoured only outside production builds). Routing,
 * the engines, the API, RLS, storage, the admin queue and the approve
 * transaction are all real.
 *
 * ── Why this is `describe.serial` ──────────────────────────────────────────
 * The steps are a genuine loop: step 4 needs the row step 3 created, step 6 needs
 * the row step 5 approved. Serial + shared module state is the honest expression
 * of that, and it means a failure names the broken LINK instead of collapsing the
 * whole flow into one red test.
 *
 * ── Selector provenance ────────────────────────────────────────────────────
 * Every selector below was read off a real render of the app, not guessed. The
 * scan half (steps 1-3) has been executed; the admin half (4-6) has NOT, because it
 * needs a test Supabase project. If you are iterating after the first real run,
 * suspect the admin selectors first.
 */

const OCR = {
  // Not in the seeded catalogue, so the scan falls through to the cold-start
  // engine path and the correction CTA is reachable (FR-7).
  frontText: "Ogun Agro Cassava Flour\nWholegrain",
  // Soybean oil -> N=1 -> Medium likelihood. OCR confidence is stubbed below the
  // 0.6 penalty threshold so the engine's OCR-quality finding actually fires.
  backText: "Ingredients: Cassava flour, Soybean oil, Palm oil, Salt",
  meanConfidence: 0.42,
};

/** State shared across the serial steps. */
const state: { productName?: string } = {};

/** Capture both panels and run the analysis. Leaves the engine verdict ready. */
async function scanBothPanels(page: Page): Promise<void> {
  await page.goto("/scan?category=gmo");

  // FR-1: the flow needs the front panel (identity + certification marks) and the
  // ingredients panel. There is no camera in CI, so this uses the Gallery
  // fallback — itself the documented accessible path (03 §8).
  await captureLabel(page);
  await expect(page.getByRole("heading", { name: "Capture the back" })).toBeVisible();

  await captureLabel(page);
  await expect(page.getByRole("heading", { name: "Scan a product" })).toBeVisible();

  await page.getByRole("button", { name: "Analyze labels" }).click();
}

/** Get past the "couldn't find this product" interstitial onto the verdict. */
async function openVerdict(page: Page): Promise<void> {
  // An uncatalogued product lands here first, with a route to the screening
  // result. This is the product's intended shape, not a failure.
  await expect(
    page.getByRole("heading", { name: /couldn't find this product/i })
  ).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "View screening result" }).click();
}

test.describe.serial("contribution loop", () => {
  test.beforeAll(() => {
    requireAdminEnv();
  });

  test("1. scan produces a verdict with two separate badges", async ({ page }) => {
    await installOcrStub(page, OCR);
    await scanBothPanels(page);
    await openVerdict(page);

    // THE central constraint (06_AGENT_CONTEXT.md §2 #1). Result and confidence
    // must be two independently readable elements — "Low likelihood / High
    // confidence" and "Low likelihood / Low confidence" must never look alike.
    //
    // They are deliberately DIFFERENT elements and different shapes: ResultBadge
    // is a <span> pill, ConfidenceBadge is a <button> chip that expands the
    // "why this confidence" panel. Asserting each one's own exact text is what
    // proves neither absorbed the other. (The exhaustive 3x3 tier matrix is
    // covered exhaustively by badges.test.tsx; this is the real-screen check.)
    const resultBadge = page.getByText(/^(Low|Medium|High) GMO likelihood$/i).first();
    const confidenceBadge = page.getByRole("button", { name: /^(Low|Medium|High) confidence$/ });

    await expect(resultBadge).toBeVisible();
    await expect(confidenceBadge).toBeVisible();
    await expect(resultBadge).toHaveText(/^(Low|Medium|High) GMO likelihood$/i);
    await expect(confidenceBadge).toHaveText(/^(Low|Medium|High) confidence$/);

    // Never claim proof (06 §2 #2). Non-dismissible, on every verdict.
    await expect(page.getByText(/cannot confirm/i).first()).toBeVisible();

    // The engine, not the UI, decides these numbers — so the screen must report
    // the OCR-quality finding rather than re-parsing the text (02 §5). It renders
    // in both the "why this confidence" panel and the verification findings list,
    // hence .first().
    await expect(page.getByText(/below the 60% threshold/i).first()).toBeVisible();
  });

  test("2. the correction form arrives pre-filled from the engine", async ({ page }) => {
    await installOcrStub(page, OCR);
    await scanBothPanels(page);
    await openVerdict(page);

    // FR-7: the contribution path is reachable from a provisional result.
    await page.getByRole("button", { name: "Add Product" }).click();
    await expect(
      page.getByRole("heading", { name: "Help us add this product" })
    ).toBeVisible();

    // The user is CORRECTING, not authoring: every field arrives filled from
    // what the engine extracted (03 §3). Selected by `name`, which is stable and
    // unambiguous — these are custom <Field> wrappers, not <label for> pairs.
    await expect(page.locator('[name="ingredients-text"]')).toHaveValue(/soybean oil/i);
    await expect(page.locator('[name="product-name"]')).toHaveValue(/cassava flour/i);

    // Give it a name the catalogue cannot contain, so step 6 exercises the stored
    // verdict path rather than silently re-running the engine.
    state.productName = `E2E Cassava Flour ${Date.now()}`;
    await page.locator('[name="product-name"]').fill(state.productName);
  });

  test("3. submitting lands the row and shows the receipt", async ({ page }) => {
    await installOcrStub(page, OCR);
    await scanBothPanels(page);
    await openVerdict(page);
    await page.getByRole("button", { name: "Add Product" }).click();
    await expect(page.locator('[name="product-name"]')).toBeVisible();

    await page.locator('[name="product-name"]').fill(state.productName!);
    await page.getByRole("button", { name: "Submit Product for Verification" }).click();

    // The upload + insert actually happened — a receipt screen is only rendered
    // after onSuccess, which runs off the server's response.
    await expect(
      page.getByRole("heading", { name: "Thanks for contributing!" })
    ).toBeVisible({ timeout: 30_000 });
  });

  test("4. an admin sees the row in the queue with a live recompute", async ({ page }) => {
    const creds = await ensureAdmin();
    await installOcrStub(page, OCR);
    await signIn(page, creds);

    await page.goto("/admin");

    const row = page.getByRole("button", { name: new RegExp(state.productName!, "i") }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });

    await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "true");

    // The reviewer approves a COMPUTED verdict, never hand-typed values
    // (02 §4.4), so the preview must exist before Approve is enabled.
    await expect(page.getByText(/Recomputed verdict \(config v/i)).toBeVisible();

    const approve = page.getByRole("button", { name: "Approve verdict" });
    await expect(approve).toBeEnabled();
  });

  test("5. approving clears the pending queue", async ({ page }) => {
    await page.getByRole("button", { name: "Approve verdict" }).click();

    // Toast first, then the row leaves the pending queue (approve_submission()
    // inserts into products AND flips status in one transaction).
    await expect(page.getByText("Verdict approved")).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: new RegExp(state.productName!, "i") })
    ).toHaveCount(0, { timeout: 30_000 });
  });

  test("6. re-scanning returns the STORED verdict, not a fresh engine run", async ({ page }) => {
    await installOcrStub(page, OCR);
    await scanBothPanels(page);

    // A catalogue match now short-circuits the cold-start path: the no-match
    // interstitial is skipped entirely and the verified card renders directly.
    await expect(
      page.getByText(/couldn't find this product/i)
    ).toHaveCount(0, { timeout: 30_000 });

    // FR-2: similarity >= 0.8 returns the stored verdict AND preserves its
    // confidence tier. This is the assertion that distinguishes "re-scanned and
    // got the same answer" from "recomputed and coincidentally agreed".
    await expect(page.getByText("Catalogue match by product name")).toBeVisible();
    await expect(page.getByText(state.productName!).first()).toBeVisible();

    // The two-badge constraint holds on a stored verdict too.
    await expect(page.getByText(/^(Low|Medium|High) GMO likelihood$/i).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^(Low|Medium|High) confidence$/ })
    ).toBeVisible();
  });
});
