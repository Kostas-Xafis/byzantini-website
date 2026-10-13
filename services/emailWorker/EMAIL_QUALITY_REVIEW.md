# Email quality review — `services/emailWorker`

Review of the generated email quality (rendering, copy, personalization, deliverability).
Evidence was produced by rebuilding all templates (`bun run templates:build`), measuring the
built HTML, loading it in headless Chrome via CDP at real device widths, and reading the
send path end to end. **No production data was sent or changed** — the only file changes
were the rebuilt, git-tracked `html_templates/` and disposable audit artifacts in `.viz/`.

Legend: **P0** = broken/lost or wrong email in production · **P1** = visible quality or
deliverability loss · **P2** = polish/maintainability.

Most of what follows is fixable in this service. Two items are not: the broken template
filename (§1, **now fixed**) and the unauthenticated registration endpoint that feeds personal
data into these emails (§3) both live in the website repo (`lib/api/routes/…`).

---

## 1. P0 — One registration-confirmation variant points at a file that does not exist

> **FIXED 2026-09-15.** The name is corrected and a regression test now guards the whole map
> (see "Status of this fix" at the end of this section). The rest of the section is kept as the
> record of what the bug was and why it was invisible.

`lib/api/routes/pupils.ts:37` (website repo), before the fix:

```ts
byzantineBDiploma: "epitixis/epitixis_eggrafi_b_diploma.html",
```

but the built file is `html_templates/epitixis/epitixis_eggrafi_byzantine_b_diploma.html`
(the `render/index.tsx:24` registry name — note the `byzantine_` prefix). Verified live: the
real name returns 200, the referenced name returns 404, and the worker's
`getHTMLTemplate` (`src/index.ts:328-330`) throws
`Could not find the HTML template (…) in the bucket.`

**Impact:** every Β' Έτος Διπλώματος student of the Byzantine department gets **no
confirmation email at all**, and it fails completely silently:

- the worker throws and returns HTTP 400 (`src/index.ts:176-182`);
- the website sends the request fire-and-forget (`pupils.ts:417`) and never inspects the
  response (`lib/api/routes/emailService.ts:12-14` says so explicitly), so the `.catch()` never
  fires either — a 400 is a *resolved* fetch;
- the only trace is a line in the worker's log.

This is a **regression**, not a new bug: `git show 41df9d8^:lib/api/routes/registrations.ts:34`
had the correct name, and the 2026-09-11 refactor ("Refactor registrations into pupils
register") introduced the wrong one. 17 production enrollments carry that class year.

**Fix applied.** `lib/api/routes/pupils.ts:37` now reads
`byzantineBDiploma: "epitixis/epitixis_eggrafi_byzantine_b_diploma.html"`, and
`tests/unit/emailTemplates.test.ts` (new, runs under the existing `bun test`) asserts that
every name in the website's map is (a) declared in `services/emailWorker/render/index.tsx`,
(b) present as a built file in `html_templates/`, and (c) present in the local
`bucket/latest` mirror when that mirror exists — plus an explicit assertion on the
`byzantineBDiploma`/`byzantineE` names. Verified both ways: 5 pass on the fixed tree, and
reintroducing the old name fails 4 of the 5 with
`Expected: "epitixis/epitixis_eggrafi_byzantine_b_diploma.html"`.

The root cause is that the template-name registry is duplicated in two repos; the test makes
the duplication safe rather than removing it. Deduplicating it (the service owning the
names, the website asking for a level instead of a filename) would be the better end state.

> Deployment note: the corrected name must exist under `html_templates/epitixis/` in the R2
> bucket. It does in the local build and mirror — confirm with a real send to a Β' Ετος
> Διπλώματος case after the next `templates:build --prod`.

## 2. P0 — Substituted values are injected into HTML unescaped

Both substitution implementations do a raw string replace:

- `src/index.ts:333-336` (worker) — `String(data[match] ?? "")`
- `src/mailersend.ts:37-43` (campaign CLI) — `data[match] || ""`

The templates are static HTML built at compile time, so React's escaping is already gone by
the time the per-recipient value is injected.

Verified with the real built template `html_templates/2026/google_review.html`:

| `first_name` value | rendered output |
| --- | --- |
| `Μαρία & Παύλος` | `Χαίρετε, Μαρία & Παύλος! 🎶` (raw `&`) |
| `<b>Δοκιμή</b>` | `Χαίρετε, <b>Δοκιμή</b>! 🎶` (injected markup) |
| `"><script>…` | injected verbatim into the element |
| `""` | `Χαίρετε, ! 🎶` |

Consequences: a name containing `&`, `<`, `>` or a quote can corrupt layout or inject markup
into every recipient's email; the same applies to `am`, `greeting` and any value placed inside
an attribute. The empty case is worse in practice than the injection case — see §4.

**This is reachable today through the transactional path, and it is the one finding I would call
a live security issue.** `POST /api/pupils` is *unauthenticated* (`lib/api/routes/pupils.ts:315-317`
passes an empty middleware list) and its schema accepts arbitrary strings for `class_year` and
`registration_year` (`lib/api/schemas.ts:153-154` — no `.min(1)`, no charset restriction).
Reproduced with the real built template: sending
`class_year = '</b><a href="https://evil.example/phish">Πατήστε εδώ</a><b>'` lands verbatim in
`epitixis_eggrafi.html` inside `<b>{{class_year}}</b>`, so a stranger can make the school's own
`no-reply@` address deliver a phishing link with a valid DKIM signature. The campaign path is
lower risk (data comes from D1, and the current 753 names/tokens are clean), but a secretary
typing `&` or `<` into a name is enough to break a batch.

**Fix:** add a shared `escapeHtml()` and use it for every substituted value in both
implementations, e.g. `escapeHtml(String(data[match] ?? ""))`. Keep a separate
`escapeUrlComponent()` for values substituted **inside** `href` attributes (`regid`,
`token`), which need percent-encoding rather than HTML escaping. Belt and braces: validate
`class_year`/`registration_year` against an allow-list at the API boundary, and treat a
`<`/`&` in any substituted value as a send-time warning.
Background on escaping user input in transactional email: [Security StackExchange](https://security.stackexchange.com/questions/277980/securing-transactional-email-user-input-escaping-for-a-email-subject).

## 3. P0 — The unauthenticated endpoint that feeds these emails can redirect them

This is upstream of the email service, but it is the email service that leaks the data, so it
belongs in an email-quality review. `POST /api/pupils` has no auth middleware
(`lib/api/routes/pupils.ts:315-317`), matches an existing pupil **by Α.Μ. alone** with no ΑΜΚΑ
check (`pupils.ts:326-330`; contrast the read-only lookup at `pupils.ts:568-569`, which does
require both), and then overwrites `email` and `amka` (`pupils.ts:339-342`).

`getRenewalRecipients` then mails whatever address is on that row
(`src/campaign/queries.ts:39-64`) — first name, last name, Α.Μ. and the pupil's permanent
`?regid=` link. So a stranger who knows a student's Α.Μ. can have that student's personal
renewal email, including the credential that prefills their registration form, delivered to an
address they control. Prod data is currently clean (753 pupils, 0 blanks), so this is a
configuration/authorisation hole rather than an incident — but it is the reason the escaping fix
in §2 matters more than it first looks.

**Fix (website repo):** require Α.Μ. **and** ΑΜΚΑ on the write path, never let an
unauthenticated caller change `email`/`amka`, and keep mailing only the address already on file.

## 4. P0 — A missing value silently produces a half-empty or empty email

Because an unresolved key becomes `""`, nothing distinguishes "send anyway" from "data bug".
Concrete cases found:

- **`html_templates/epitixis/epitixis_eggrafi.html`** always renders the info callout
  "Πληροφορίες εγγραφής" because the guard in `render/emails/SuccessfulRegistration.tsx:69`
  tests the *literal* strings `"{{class_year}}"`, `"{{class_type}}"`, `"{{registration_year}}"`,
  which are always truthy at build time. If the API sends an empty `class_year`, the student
  gets a box with blank labels: `Τμήμα: …` / `Έτος φοίτησης: ` / `Σχολικό έτος: `.
- The website builds `class_type` by ternary on `class_id`
  (`lib/api/routes/pupils.ts:423`): any unexpected `class_id` falls into "Ευρωπαϊκής Μουσικής",
  and `registration_year` is passed straight through with no validation.
- `renew-2026` renders `{{first_name}} {{last_name}}` inside the personal-data box; the query
  (`src/campaign/queries.ts:39-54`) does not trim or reject empty names — `pupils` rows with an
  empty name render as "Σπουδαστής/-στρια:  " with an empty bold value. Note the sibling query
  *does* guard this (`queries.ts:144` requires a non-blank `first_name` for the Google-review
  campaign) and the public registration form accepts `first_name: ""` (`lib/api/schemas.ts` has
  no `.min(1)`), so creating such a row is one request away.
- `renew-2026` also renders `href="…/eggrafes?regid={{regid}}"` with no guard on
  `registration_url` (`queries.ts:60`); the column defaults to `''`
  (`migrations/0002_pupils.sql:41`), which yields a CTA that opens an un-prefilled form.
- `teachers-eggrafes-2026` derives the greeting from `gender === "F" ? … : "Αγαπητέ συνάδελφε,"`
  (`src/campaign/queries.ts:204`) — NULL/unknown gender silently becomes masculine.
- The API path can send an out-of-range `class_id` (`schemas.ts:13` is `positiveInt`, unbounded),
  which silently becomes "Ευρωπαϊκής Μουσικής" *and* falls back to the generic template
  (`pupils.ts:424`).

Production data is currently clean — 753 pupils, 0 blank names, 0 blank `registration_url`s,
all 2 928 unsubscribe tokens and 753 `regid`s present and alphanumeric — so these are latent
traps, not live defects. That is exactly why they need an assertion instead of a careful reader.

**Fix:** make substitution fail loudly. Resolve all placeholders in one pass, and if a
*required* placeholder has no value, either (a) abort the send in a dry-run/validation mode,
or (b) substitute an explicit fallback (`φίλε/-η`, `αξιότιμε/-η κύριε/κυρία`) — but never an
empty string next to a comma. A per-template `required: string[]` list belongs in
`render/index.tsx` (or a new `render/meta.ts`) so the build can assert it. Add the missing
`AND TRIM(COALESCE(p.first_name,'')) <> ''` / `AND registration_url <> ''` guards to the renewal
query too.

## 5. P0/P1 — There is no pre-send validation gate, and duplicates are not detected

- `campaign-state/renew-2026.json` (389 sent) and `campaign-state/renew-2026-fix.json`
  (345 sent) share **345 recipients** — a "ΔΙΌΡΘΩΣΗ" (correction) campaign that re-mailed
  almost the whole list. State is per campaign (`campaign-state/<id>.json`), so nothing
  dedupes across campaigns; `renew-2026-fix` is a copy-pasted `CampaignConfig`
  (`src/campaign/campaigns.ts:27-37`) rather than a first-class resend. Nothing records *why*
  the correction was needed, so the same mistake is free to happen again.
- **Siblings sharing an inbox are silently dropped.** `collectRecipients` dedupes by lowercased
  email (`src/campaign/runner.ts:53-60`). In production the renewal query returns 251 recipients
  but only **223 distinct addresses** — 16 addresses cover ≥ 2 pupils and one
  (a shared parent address) covers **18**. So 28 students never get their personal link, and the
  parent gets exactly one email containing the first child's name, Α.Μ. and `regid`. The only
  signal is a `console.warn` in a run that nobody reads.
- **Nothing validates placeholders.** Both substitutions resolve every `{{key}}` to `""` with no
  leftover check, and neither side declares which keys a template needs. Concretely: the website
  sends `token` for all seven `epitixis` variants (`pupils.ts:421-426`) although not one of those
  templates contains `{{token}}` — a dead key that also hides the fact that transactional mails
  deliberately have no unsubscribe footer. A typo like `{{firstname}}` would ship as an empty
  string with no error anywhere.
- The **subject line escaped review**: `subject: "ΔΙΌΡΘΩΣΗ - …"` uses a Greek capital iota with
  tonos (Ί) instead of a plain accented capital (ΙΟΡΘΩΣΗ/ΔΙΟΡΘΩΣΗ). More broadly, all campaign
  subjects are hardcoded ASCII-hyphenated strings — e.g. `"Έναρξη Εγγραφών - Μαθημάτων 2026-27"`
  — while the bodies are properly typeset with `—`. MailerSend transforms nothing, so this is
  literally what lands in the inbox.
- Dry runs only render previews; nothing checks that the preview is *sane*. A stale ad-hoc
  preview in `out/epitixis-eggrafi-preview-1.html` even renders `Τμήμα: 1` (a raw numeric
  `class_id`) — worth deleting so nobody trusts it.
- A missing binding/token in the website turns into a 500 *after* the pupil rows are written
  (`lib/api/routes/emailService.ts:31-34` throws synchronously, so the `.catch()` at
  `pupils.ts:417` is never attached — no rollback, no email), which is the opposite of the
  "a mail outage must not fail a registration" comment right above it.

**Fix:** add `scripts/checkTemplates.ts` (wired into `templates:build`) that renders every
registered template with realistic sample data and fails on: leftover `{{placeholders}}`,
`« , »`/`, !`-style empty inserts, empty `href=""`, suspiciously short body text, and any
template whose plain-text sibling is missing. Declare each template's required keys next to its
registration and reject unknown keys at send time. In the runner, group by household instead of
dropping siblings (one email per pupil, or one email listing each child's link) and print the
dropped count in the run summary. Finally, make the website's email helper `async` so a
configuration error is a logged warning, not a failed registration.

---

## 6. P1 — Rendering facts about the current build (measured)

Probed with `chrome-headless-shell` via CDP at 380 px (mobile) and 700 px (desktop):

| Check | Result |
| --- | --- |
| `viewport` meta | **absent** in every template → iOS Mail / Gmail iOS fall back to a ~980 px layout viewport and scale the whole email down (18 px body copy renders ≈7 px on a 390 px screen) |
| `@media` queries | **0** in every template |
| Layout mechanism | table-based (`role="presentation"` on 100 % of tables) with `max-width: 600px` + `padding: 24px 12px` on the outer `<table>` |
| Outlook desktop | that `max-width` **and** the table-level `padding` are both ignored by the Word engine → the card goes full-width with no gutters and no inner padding |
| MSO/VML button fallback | only React Email's `mso-font-width` spacer hack; no VML button and no ghost table |
| Badge pill | `display:inline-block` + padding on a `<p>` → Outlook renders it as a **full-width pink band** instead of a pill |
| Signature at 320 px | logo `<td>` is a fixed `width="76"` → ≈146 px left for the address column, 8–10 line wraps |
| Images | 2 (`logo_small.png` 13 KB, poster 245 KB), both with meaningful Greek `alt` |
| Poster without images | renders at `420 × 18 px` — no `height` attribute, so blocked-image clients collapse it to a sliver |
| External hosts | only `musicschool-metamorfosi.gr`, `g.page`/`maps.app.goo.gl`, `w3.org` DTD, social links; no scripts/forms/iframes, no tracking pixel |
| `lang` / dir | `lang="el" dir="ltr"` ✔ |
| No web fonts | ✔ (system stack, Greek-safe) |
| HTML size | 15–36 KB per template — far below Gmail's ~102 KB clipping limit ✔ |
| React markers | `<!--$-->`, `<!--html-->`, `<!--head-->`, `<!--body-->`, `<!--/$-->` at fixed offsets in every file — **harmless**, nothing renders comment text (≈30 bytes/file) |

**Fixes, in value order:**

1. Add `<meta name="viewport" content="width=device-width,initial-scale=1">` and a small
   `<style>` block with `@media (max-width: 600px)` rules: reduce card padding to ~16 px, make
   buttons full-width (`display:block`), stack the signature's two columns, and let the poster
   scale to `width:100%`. React Email supports `<Head>` children; this is a small change in
   `render/parts/EmailLayout.tsx`.
2. Wrap the card in an Outlook ghost table
   (`<!--[if mso]><table width="600" align="center"><tr><td><![endif]--> … <![endif]-->`) and
   move the card's padding onto a `<td>`, so Outlook desktop gets the 600 px card and gutters
   instead of full-width, padless text.
3. Give `CenteredImage` an explicit `height` for the poster (or an inline
   `background`/border placeholder box) so blocked images don't collapse the layout.
   ~30 % of recipients see images blocked by default.
4. Render the badge as a one-cell table with padding on the `<td>` instead of
   `display:inline-block` on a `<p>`, and consider a bulletproof (VML) button for the two
   primary CTAs.

## 7. P1 — Dark mode is unhandled

`render/theme.ts` hardcodes a light palette (`card #ffffff`, `text #222222`, `bg #f6f2ec`) and
the layout emits no `<meta name="color-scheme">`, no `prefers-color-scheme` styles, and no
dark-mode-safe colors. In Apple Mail / Outlook dark mode the white card is either force-inverted
(which wrecks the brand-red tints and the gold callout) or left glaringly white inside a dark UI.
The `#fdf1eb` / `#fff8e1` tints and the gold `#e8a400` on gold-tint (measured contrast
**2.03:1**) are the most fragile.

The logo is the concrete casualty: `public/logo_small.png` is a 128×128 RGBA image that is
**72 % fully transparent and 100 % of its opaque pixels are dark** (luminance 28–42/255). It
sits on the white card at 64×64, so when the card darkens (or a client inverts the transparent
area) the mark effectively disappears. A light/inverse logo variant for dark mode, chosen with
`@media (prefers-color-scheme: dark) { .logo-light { display:none } … }`, is the usual fix.

**Fix:** add `<meta name="color-scheme" content="light dark">` + `<meta name="supported-color-schemes">`,
and a `prefers-color-scheme: dark` block that redefines the card to a dark surface with light
text. Keep a light-only fallback by wrapping the darkened rules in
`@media (prefers-color-scheme: dark)`. Reference: [Bird/Taxi dark-mode guidance](https://docs.bird.com/taxi/email-and-taxi-for-email-best-practices/dark-mode/dark-mode-best-practice-and-tips).

## 8. P1 — Contrast and accessibility

Measured on the built HTML (WCAG AA needs 4.5:1 for body text, 3:1 for large text):

| Element | Ratio | Size |
| --- | --- | --- |
| Unsubscribe disclaimer (`#999999` on white) | **2.85:1** | 11.5 px |
| Unsubscribe link (`#888888`) | 3.54:1 | 13 px |
| Social links, footer meta (`#888888`) | 3.54:1 | 12 px |
| Gold stars (`#e8a400` on `#fff8e1`) | 2.03:1 | 26 px (large – passes) |
| Body text (`#222222` on white) | ~15:1 | 18 px ✔ |
| Brand red (`#9c1006` on white) | ~9.7:1 | ✔ |

The unsubscribe disclaimer is the worst offender and it is also the legally meaningful line.
Seven low-contrast text nodes were reported per template. Link affordance is a second issue:
inline links are `font-weight:bold`, but the signature, social and unsubscribe links rely on
color alone (`text-decoration: none`), and link-vs-body contrast is only 1.89:1
(`#9c1006` vs `#222222`).

**Fix:** darken `textSubtle`/`textFaint` to about `#6b6b6b`/`#767676`, raise the unsubscribe
line to ≥ 12 px, and underline the footer links (or keep bold + color but verify against the
dark-mode palette).

## 9. P1 — Deliverability and message hygiene

1. **`renew-2026` sends no plain-text part.** Its `CampaignConfig` has no
   `plainTextTemplateName` (`src/campaign/campaigns.ts:16-26`) although the other three 2026
   campaigns have one — and this is the *largest* send. The plain-text part is a known
   inbox-placement factor and MailerSend supports it via `setText`
   (`src/mailersend.ts:119-122`). See [plain-text vs HTML](https://emailens.dev/blog/plain-text-emails).
   Nine of twelve templates have no text alternative at all (the 7 `epitixis/*` and
   `sysuser_register_link.html` are transactional, so the priority is `renew-2026`).
2. **`renew-2026` has no text template file either** — `text_templates/2026/` only contains
   `epistrofi_mathiton.txt`, `google_review.txt`, `upenthimisi_eggrafis_kathigites.txt`.
   `getTextTemplate()` (`src/mailersend.ts:27-35`) also swallows a missing file with a warning
   and silently sends HTML-only, so a broken path is invisible in production.
3. **Reply-to is `no-reply@`** (`src/index.ts:260`, `src/mailersend.ts:109`). Parents and
   teachers reply to these emails; every reply currently bounces or is dropped. Point
   `reply_to` at the secretariat inbox (`music@inmm.gr`).
4. **Subject lines are weak and inconsistent**: no personalization, ASCII hyphens, an
   unaccented `ΔΙΌΡΘΩΣΗ`, and a leading `🎼` on one campaign only. Decide on one convention
   (`Σχολή … | …`) and use it for all campaigns, subjects **and** `Preview` text.
5. **Image-to-text ratio**: the poster is a 245 KB, 420 px-wide image used in three campaigns,
   embedded *and* attached. That is the classic promo-email shape; consider sending the poster
   as an attachment only (keeping the inline version for one campaign) or downscaling it to
   ~600 px wide / <100 KB.
6. **The poster URL is served with no `Content-Type` header at all** (verified:
   `curl -I https://musicschool-metamorfosi.gr/emails/files/<encoded name>.jpg` → `200`,
   `content-length: 245404`, no `content-type`; the bytes are a valid 874×1240 baseline JPEG,
   and `logo_small.png` on the same host *does* return `image/png`). Some clients and image
   proxies refuse to render an image with no declared type. The next bullet explains why the
   filename looks odd — fix the site's static file handler so it returns `image/jpeg`.
7. **The poster is sent twice and under two different names.** `render/assets.ts:9` builds the
   URL from `"Ανακοίνωση Έναρξης Μαθηματων 2026.jpg"` (no accent — the accented spelling
   returns **404**), while `POSTER_FILENAME` is the accented `"…Μαθημάτων 2026.jpg"`, so the
   inline image and the attachment disagree. It is also delivered twice: inline *and* as a
   245 KB attachment (≈327 KB base64 per message, `src/campaign/attachments.ts`), which shows
   up to the recipient as a paperclip plus duplicated content. Rename the file once, keep
   URL and filename identical, and keep the attachment only if it earns its weight (it is the
   only copy that survives image blocking).
8. **Campaign copy and the plain-text twin diverge** — e.g. `render/emails/EpistrofiMathiton.tsx:27`
   opens "Αγαπητοί μας μαθητές" while `text_templates/2026/epistrofi_mathiton.txt` and
   `UpenthimisiEggrafis.tsx:51` use "σπουδαστές"; the HTML lists four study areas, the text
   version lists three plus a different label. They are maintained by hand, so they drift.
9. **The teacher campaign has no unsubscribe link at all.** `grep -c "Απεγγραφή"` is 0 in
   both `upenthimisi_eggrafis_kathigites.html` and its `.txt`, because
   `UpenthimisiEggrafisKathigites.tsx:37-39` never passes a `token` to `EmailLayout`. It is
   deliberate (`src/campaign/queries.ts:179-186` argues teachers are staff), but it is still
   bulk mail to ~dozens of people with no opt-out — the other three bulk templates have one.
   `List-Unsubscribe` headers are also deliberately absent (MailerSend plan limitation,
   `src/mailersend.ts:114-118`), so there is currently no machine-readable opt-out either.
10. **Two link shorteners in the review email** (`g.page/r/…/review` and
    `maps.app.goo.gl/…`). They are Google-owned, but shorteners hide the destination from both
    the recipient and the filters; link the full `google.com/maps` place URL instead.

## 10. P2 — Copy, personalization and maintainability

- **Personalization is thin.** `renew-2026` greets everyone with "Αγαπητοί σπουδαστές," even
  though the query already fetches first/last names, Α.Μ. and the deep link. `return-2026`
  cannot personalize (no data), but `renew-2026` can and should: "Αγαπητέ/ή {{first_name}},".
  `google_review` is the only campaign that greets by name.
- **Hardcoded season strings everywhere**: `WELCOME_YEAR`/`REGISTRATION_YEAR` literals in
  `UpenthimisiEggrafis.tsx:24`, `EpistrofiMathiton.tsx:14`, `UpenthimisiEggrafisKathigites.tsx:19-20,44`,
  the campaign subjects/titles, the three `.txt` files, and the poster alt text
  ("… Μαθημάτων 2026"). Next year this is a 10-file find-and-replace with real risk of
  sending last year's dates. Move it to one `SEASON` object in `render/schoolContact.ts` (or
  a `render/season.ts`) and reference it from the campaigns and text templates.
- **Emoji density**: `epistrofi_mathiton` uses 15 emoji, `google_review` 9, the rest 1–6.
  Outlook desktop renders them as monochrome outlines, and they duplicate information already
  carried by the icon column. One is a genuine compatibility risk: `🪪` (U+1FAAA,
  IDENTIFICATION CARD, Unicode 14 / 2021) in `UpenthimisiEggrafis.tsx:69` is newer than the
  Segoe UI Emoji shipped with older Windows/Office and is the likely tofu box there — the
  adjacent "Αριθμός Μητρώου (Α.Μ.)" label already says the same thing.
- **The registration deep link is a permanent bearer credential.** `pupils.registration_url`
  is a 32-char random token with no expiry (`migrations/0002_pupils.sql:41`), rendered in the
  email body as `<a href="…/eggrafes?regid=…">`, and the endpoint it hits,
  `GET /pupils/reregistration/[url]` (`lib/api/routes/pupils.ts:579-584`), has **no auth
  middleware**. Anyone who receives a forwarded email can fetch that pupil's record including
  address, phone, birth date and ΑΜΚΑ. Consider a time-limited prefill link
  (`?regid=…&exp=…`) or dropping `regid` from the email in favour of the plain `/eggrafes`
  page where practical.
- **`Subject` vs `Preview` duplication**: the `Preview` (preheader) text is well written, but
  it repeats the subject's opening in several templates; the preheader is the second-strongest
  inbox element after the subject, so it should add information instead of echoing it.
- **README drift**: `README.md:17-19` describes `render/` → `html_templates/` and says the
  old Cloud Run service is "kept for reference", but `src/mailersend.ts` is still the campaign
  CLI's send path; the README's "Campaign CLI" section never says which file sends the email.
  Worth a short "paths" table so the next person doesn't edit the wrong mailer.

---

## Suggested order of work

1. ~~The `epitixis_eggrafi_b_diploma.html` filename (§1)~~ — **done** (string + regression test).
2. Escaping + required-placeholder enforcement in both substitution paths (§2, §4) — small,
   contained, removes the worst failure mode.
3. The unauthenticated pupil-write path behind the personal data (§3) — website repo, but it is
   what makes §2 exploitable rather than embarrassing.
4. `scripts/checkTemplates.ts` gate + cross-campaign duplicate warning + the sibling-drop bug
   (§5).
5. `reply_to` → secretariat, the missing plain-text template for `renew-2026`, the poster
   `Content-Type`/filename (§9).
6. Viewport meta + mobile media queries + image `height` + the Outlook ghost table (§6).
7. Dark-mode meta + palette (§7), then contrast fixes in `render/theme.ts` (§8).
8. Season constants, copy consistency between HTML and `.txt`, subject convention (§10).

## What is already good (keep it)

- Table-based layout, `role="presentation"` on every table, `border/cellpadding/cellspacing=0`,
  `align="center"` on the container — the Outlook-survivable fundamentals are in place.
- Every `<img>` has meaningful, human Greek `alt` text (18/18), explicit `width`, and
  `display:block`; nothing is a filename or empty.
- The preheader is real, per-template, and hidden four different ways, so it degrades safely.
- No web fonts, no external stylesheet, no `!important`, no tracking pixel, no `http://`
  asset link, no unencoded space in any URL; all 12 files are 15–36 KB.
- `lang="el" dir="ltr"`, charset first in `<head>`, `x-apple-disable-message-reformatting`.
- Contrast is good for everything that matters (body 15:1, brand red 8.4:1, CTA 8.4:1).
- The placeholder inventory is honest: every placeholder in every current template is supplied
  by its caller, and the key names line up exactly (`class_year` is not swapped with
  `registration_year` anywhere). The class-year string literals match the database
  codepoint-for-codepoint, so the `Β' Ετος Διπλώματος` selection works.
- The React Email component split (`parts/` + `emails/` + `theme.ts` tokens) is the right
  structure — most of the fixes above are one edit in a single shared part.

## Limits of this review

No test email was sent (deliberate: real recipients). Everything client-specific is derived
from the built bytes plus documented behaviour, so a few things could not be verified and are
flagged as such rather than guessed: whether Gmail/Outlook proxies reject the header-less
poster, whether MailerSend auto-generates a text part when `setText` is absent, the exact
Word-engine rendering of `<hr>` and the mso button spacers, and the real open/click rates —
the templates contain **no tracking pixel**, so there is currently no per-send feedback loop
to confirm any of this with data. Adding a measuring step (opens/clicks per template) is worth
more than any single fix here once the basics are done.

## How the evidence was produced

- Rebuilt every template with `bun run templates:build` and measured the output bytes
  (tag/style/attribute census, URL and placeholder extraction, per-file size).
- Loaded the real built files in headless Chrome over CDP at 320/360/380/700 px, in light and
  dark mode, and with image loading blocked: computed styles, overflow detection, contrast
  ratios, rendered image dimensions, element counts.
- Probed `https://musicschool-metamorfosi.gr` for the poster and logo (status, headers, bytes).
- Traced the whole send path by hand (worker `src/index.ts`, CLI `src/mailersend.ts`, campaign
  runner/queries, and the website's callers), and cross-checked the template↔data mapping in
  both directions.
- Compared the two `campaign-state` files for overlapping recipients, and read the production
  D1 snapshots (read-only) for name/token/`regid` hygiene and the sibling-email collision count.
- Two independent audits of the same tree (one on the data/personalization layer, one on the
  rendered HTML) reached the same conclusions on the escaping and placeholder findings, which is
  the strongest signal here: the failure modes are structural, not cherry-picked.

## Audit artifacts

`.viz/probe.mjs` (CDP layout/contrast probe) and `.viz/*.png` (renders at 700 px/400 px width,
plus an images-blocked render) are disposable; delete the folder if you don't want them in the
tree. The templates were rebuilt with `bun run templates:build` (the only tracked files that
changed). A `node_modules/` was installed in this directory because dependency resolution did
not find `@react-email/*` at the repo root; it is gitignored.
