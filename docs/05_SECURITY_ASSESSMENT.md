# Security Vulnerability Assessment & Hardening Guide

**Scope:** Next.js PWA + Supabase, anonymous-write submission model, admin moderation
**Method:** Threat-model by trust boundary, then per-finding remediation

---

## 1. Threat model summary

The application has an unusual and risky shape for a 4-week build: **it accepts writes and file uploads from unauthenticated users.** That single design decision generates most of the findings below. It's the right product decision (the contribution loop is the point), but it means the write path needs real controls rather than the defaults.

### Assets worth protecting

| Asset | Why it matters |
|---|---|
| `products` verified dataset | The product's entire credibility. Corrupted data = wrong health-adjacent verdicts |
| `lookup_config` rulesets | Controls every verdict the app produces |
| Submission images | User-generated photos; may incidentally contain faces, addresses, receipts |
| Admin accounts | Compromise = write access to the verified dataset |
| Supabase service role key | Full database access, bypasses all RLS |

### Primary threat actors

1. Opportunistic spammer — automated junk submissions
2. Motivated bad actor — poisoning verdicts for a specific brand
3. Curious user — reading the client bundle, calling the API directly
4. Compromised dependency — supply-chain risk in a large npm tree

---

## 2. Findings

Severity: **C**ritical / **H**igh / **M**edium / **L**ow

---

### SEC-01 · Service role key exposure · **CRITICAL**

**Risk:** The Supabase service role key bypasses all RLS. If it reaches the browser bundle, any visitor has full read/write on every table.

**How it happens:** Naming it `NEXT_PUBLIC_*`; importing the server Supabase client into a component that is (or becomes) a client component; logging the config object.

**Remediation:**
- Service role key stored as `SUPABASE_SERVICE_ROLE_KEY` — never with a `NEXT_PUBLIC_` prefix
- Instantiated only inside `lib/supabase/server.ts`, which starts with `import 'server-only'`
- Add a CI check that greps the production build output for the key value and fails the build on a match
- Rotate immediately if ever committed to git — assume public the moment it's pushed

---

### SEC-02 · Missing or permissive RLS · **CRITICAL**

**Risk:** The anon key is public by design and ships in the client bundle. Any table without RLS is fully readable and potentially writable by anyone who reads that bundle. This is the single most common serious Supabase misconfiguration.

**Remediation:**
- `alter table ... enable row level security` on every table, including any added later
- Deny-by-default: no policy means no access — never write `using (true)` on a write policy
- Verify with an anon-key script that attempts: read `submissions`, insert into `products`, update `lookup_config`. All three must fail.
- Add that script to CI so a future migration can't silently regress it

---

### SEC-03 · Privilege escalation via client-writable role · **CRITICAL**

**Risk:** If the admin role lives in `auth.users.raw_user_meta_data`, a user can update their own metadata via the client SDK and grant themselves admin.

**Remediation:**
- Role lives in the `profiles` table with RLS preventing self-update of `role`
- All admin checks call the `is_admin()` `SECURITY DEFINER` function, which reads `profiles`
- Never trust a role claim read from the client session
- Admin accounts require MFA (Supabase Auth supports TOTP enrollment)

---

### SEC-04 · Unauthenticated write abuse · **HIGH**

**Risk:** The submission endpoint accepts anonymous writes. Without controls: queue flooding, storage cost exhaustion, and a denial-of-review attack where genuine submissions drown in noise.

**Remediation:**
- Rate limit at the Route Handler: per-IP (e.g. 5 submissions/hour) and a coarse client fingerprint as a secondary key
- Add a proof-of-work or invisible CAPTCHA (Cloudflare Turnstile) on the submission form — cheap for a real user, expensive for a bot
- Cap total pending submissions per IP; reject new ones beyond the cap
- Monitor queue depth; alert on unusual growth
- Keep `submissions` insert-only for anon — no update, no delete

---

### SEC-05 · Malicious file upload · **HIGH**

**Risk:** An attacker uploads an SVG containing script, an oversized file, or a polyglot image. If the bucket is public or images are rendered inline in the admin panel, this becomes stored XSS against the admin — the highest-value target in the system.

**Remediation:**
- Bucket is **private**; admin access via short-TTL signed URLs only
- Allowlist `image/jpeg` and `image/png` only. **Reject SVG entirely** — it is an executable document format
- Validate magic bytes server-side, not just the declared MIME type or file extension
- Re-encode images client-side via Canvas before upload — this normalises the format and strips EXIF in one step
- Enforce max 5MB
- Render admin previews in an `<img>` tag only, never inline or as an `<object>`/`<iframe>`

---

### SEC-06 · Stored XSS through submission text · **HIGH**

**Risk:** Ingredient text and product names flow from anonymous users into the admin review panel and then into `products`, where they render for every user. A payload in `product_name` becomes persistent XSS.

**Remediation:**
- React escapes by default — the rule is simply **never use `dangerouslySetInnerHTML`** for any user-derived content, anywhere
- Validate with Zod on the server: length caps (name ≤ 200, ingredients ≤ 5,000), character allowlist for names
- Strip control characters and zero-width characters on ingest
- Set a Content-Security-Policy header (see SEC-11) as defence in depth

---

### SEC-07 · Data poisoning of the verified dataset · **HIGH**

**Risk:** This is the product-specific threat. A brand-motivated actor submits plausible-looking but false ingredient data to flip verdicts. It passes review because it looks ordinary. The result is wrong health-adjacent information presented with a High confidence badge — the most damaging possible failure for this product.

**Remediation:**
- Approval requires the reviewer to see the photo alongside the text — never approve text-only
- The admin approves a **recomputed** `EngineResult`, not hand-typed values, so verdicts stay consistent with the ruleset
- Log `source_submission_id`, `created_by`, and `reviewed_by` on every product row — full provenance, so a bad actor's entire contribution history can be traced and reverted
- Flag submissions whose ingredients text differs drastically from the OCR text as needing extra scrutiny (a large delta means the user rewrote rather than corrected)
- Require two approvals for products in high-traffic categories, if reviewer capacity allows
- Keep an easy revert path: because approvals are logged, `delete from products where source_submission_id in (...)` cleans up a bad actor completely

---

### SEC-08 · `lookup_config` treated as executable · **HIGH**

**Risk:** The configs contain regex patterns fetched at runtime. Two dangers: (a) if any code path passes config content to `eval()` or `new Function()`, a config compromise becomes remote code execution; (b) attacker-controlled regex can cause catastrophic backtracking (ReDoS), freezing the browser.

**Remediation:**
- **Never** `eval()` config content. Regex strings go to `new RegExp(pattern)` only
- Validate config shape with Zod on fetch before use — reject malformed configs and fall back to the cached version
- Review every regex for nested quantifiers (`(a+)+`) before publishing a config
- Run engine matching inside the OCR Web Worker so a pathological regex cannot freeze the main thread
- Add a timeout guard around matching; abort and degrade to low confidence rather than hanging
- `lookup_config` writes are admin-only via RLS (SEC-02)

---

### SEC-09 · PII leakage through submitted photos · **MEDIUM**

**Risk:** Users photograph products in homes and shops. Images may incidentally capture faces, addresses, or receipts. EXIF data frequently contains GPS coordinates — meaning a submission can silently disclose a user's home location.

**Remediation:**
- Strip EXIF client-side before upload (the Canvas re-encode in SEC-05 does this)
- Private bucket, signed URLs, admin-only access (SEC-05)
- Define a retention policy: delete images for rejected submissions after 30 days; for approved ones, keep only if needed for audit
- State plainly in the submission UI that the photo is reviewed by a human
- Never expose `submitter_fingerprint` or IP in any client-facing response

---

### SEC-10 · Insecure direct object reference in admin routes · **MEDIUM**

**Risk:** `/api/admin/approve` receiving a `submission_id` without re-checking the caller's role server-side. UI-only gating is not access control — an attacker calls the endpoint directly.

**Remediation:**
- Every admin Route Handler re-verifies the session and role server-side before acting
- `approve_submission()` itself raises on `not is_admin()` — defence at the database layer even if the route check is bypassed
- `execute` revoked from `anon` on all admin functions
- Never accept a `role` or `is_admin` value from the request body

---

### SEC-11 · Missing security headers · **MEDIUM**

**Remediation** — set in `next.config.js`:

```javascript
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(), microphone=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: [
      "default-src 'self'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "script-src 'self' 'wasm-unsafe-eval'",      // Tesseract.js needs WASM
      "connect-src 'self' https://*.supabase.co",
      "worker-src 'self' blob:",                    // OCR worker
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ') }
];
```

Note `wasm-unsafe-eval` is required by Tesseract.js — it permits WASM compilation but **not** JavaScript `eval()`, so it doesn't undermine SEC-08.

---

### SEC-12 · Camera permission and HTTPS · **MEDIUM**

**Risk:** `getUserMedia` over plain HTTP either fails or, on a compromised network, exposes the stream. Over-broad `Permissions-Policy` allows embedded third-party content to request the camera.

**Remediation:**
- HTTPS enforced everywhere; HSTS set (SEC-11)
- `Permissions-Policy: camera=(self)` restricts camera access to first-party code
- Request camera permission only on explicit user action, never on page load
- Stop all media tracks when leaving the scan flow — a live camera indicator after navigation destroys user trust

---

### SEC-13 · Dependency and supply chain risk · **MEDIUM**

**Risk:** A Next.js + Tesseract + Supabase tree is large. A compromised transitive dependency executes with full access to the page, including the user's session.

**Remediation:**
- Commit the lockfile; use `npm ci` in CI
- Enable Dependabot or Renovate with automated security updates
- Run `npm audit --audit-level=high` in CI as a blocking step
- Pin Tesseract.js language data to a specific version and self-host it rather than pulling from a third-party CDN at runtime
- Subresource Integrity on any remaining external script

---

### SEC-14 · Verbose error disclosure · **LOW**

**Risk:** Raw Postgres errors returned to the client leak schema details, constraint names, and policy structure.

**Remediation:**
- Catch errors in Route Handlers; return generic messages with a correlation ID
- Log full detail server-side only
- Disable the Next.js error overlay in production (default, but verify)

---

### SEC-15 · No abuse monitoring · **LOW**

**Remediation:**
- Log submission volume per IP and per fingerprint
- Alert on: pending-queue spikes, repeated failed admin logins, unusual `lookup_config` writes
- Supabase provides query and auth logs — enable retention before launch, not after an incident

---

## 3. Pre-launch checklist

**Must be complete before any public access:**

- [ ] RLS enabled and verified on every table via an anon-key test script
- [ ] Anon key test suite passes: cannot read `submissions`, cannot write `products`, cannot write `lookup_config`
- [ ] Service role key absent from the production build output (CI-checked)
- [ ] Admin role stored in `profiles`, not user metadata; MFA enabled on all admin accounts
- [ ] Storage bucket private; signed URLs only; SVG rejected; magic-byte validation server-side
- [ ] Rate limiting live on the submission endpoint
- [ ] Zod validation on every server-accepted payload
- [ ] Security headers including CSP deployed and verified
- [ ] No `dangerouslySetInnerHTML` anywhere in the codebase (grep it)
- [ ] No `eval()` / `new Function()` anywhere (grep it)
- [ ] EXIF stripping confirmed on a real photo with GPS data
- [ ] `npm audit` clean at high severity
- [ ] Staging uses a separate Supabase project from production

---

## 4. Ranked remediation order

If time is short, this is the order that buys the most safety per hour:

1. **RLS on every table + anon-key verification** (SEC-02) — one misconfiguration here compromises everything
2. **Service role key containment** (SEC-01)
3. **Admin role in `profiles`, not metadata** (SEC-03)
4. **Private bucket + SVG rejection + magic-byte validation** (SEC-05)
5. **Rate limiting + Turnstile on submissions** (SEC-04)
6. **Security headers / CSP** (SEC-11)
7. Everything else

Items 1–3 are non-negotiable. A demo that leaks its database is worse than a demo with one fewer feature.
