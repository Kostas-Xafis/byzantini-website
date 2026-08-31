# Phase 4 Spec — API layer port (Isokratis style)

## Goal
Port each old route group (`lib/routes/<group>.client.ts` + `.server.ts`) into a
single new file `lib/api/routes/<group>.ts` that exports a `xxxRoutes` object of
`APIServer` instances, with **exactly the same route keys** (endpoint names must
not change: `"Group.key"` — the app components rely on them).

The old and new systems coexist until every group is ported; the API entry point
switches only at the very end (coordinator's job).

## Read first
- Reference implementation: `lib/api/routes/books.ts` (**copy its shape**).
- Core classes: `lib/api/routes/APIClient.ts` (client), `lib/api/routes/APIServer.ts`
  (server + `handlerResult` + `HTTP`), `lib/api/routes/cookies.ts` (`COOKIE`),
  `lib/api/routes/middleware/authenticate.ts`.
- Zod schemas: `lib/api/schemas.ts` (all entity schemas already ported, Greek
  messages preserved; also `z_FileUpload`, `z_AnnouncementImageUpload`).
- The old group files you are porting (**the source of truth for logic**).

## Conventions (must follow)

1. **Contract** — `new APIServer({ method, path, schema?, responseSchema?, multipart? }, [authenticateMiddleware], handler)`.
   Only add `authenticateMiddleware` where the old contract had `authentication: true`.
   Add `responseSchema` whenever the old response type is meaningful (typed client responses).
2. **Handler** — `({ params, body, request, cookies, env }) => handlerResult(fn, "Greek error message")`.
   - `body` is already parsed + validated (JSON or multipart-coerced) — **drop all
     `getUsedBody`/`ctx.request.json()`/`formDataToObject` logic**.
   - `params` values are **strings** — convert with `Number(params.id)` where needed
     (the old slug values were typed).
   - business logic stays byte-for-byte identical otherwise: same SQL, same queries,
     same `questionMarks(...)`, same transaction pattern (`async (T) => {...}` gets the
     D1 transaction shim via `handlerResult` when `fn.length === 1`), same Greek messages.
   - `Env.env` still works for env reads (do not reintroduce `locals.runtime`).
   - Cookies: use `cookies.set(COOKIE.sessionId, ...)` / `cookies.delete(...)` (never raw headers).
   - `Insert` type comes from `@lib/api/schemas`.
3. **Zod mapping** (valibot → zod): `object`→`z.object`, `string`→`z.string().min(1, msg)`,
   `email()`→`z.email(msg)`, number+integer+min→`z.number().int().min(n, msg)`,
   `union([literal("a"),literal("b")])`→`z.union([...], { message })`,
   `optional`→`.optional()`, `nullable`→`.nullable()`, `omit`→`.omit({...})`,
   `pick`→`.pick({...})`, `merge`→`.extend({...})`, `array`→`z.array(...)`,
   `looseBoolean`→`z.union([z.boolean(), z.literal(0), z.literal(1)], { message })`,
   `positiveInt`→`z.number().int().min(0, msg)`.
   **Group-specific request schemas live INSIDE the group file** (do not edit
   `lib/api/schemas.ts`).
4. **Files you may touch**: ONLY `lib/api/routes/<your-group>.ts` (create it).
   Never edit `lib/api/routes/index.ts`, `lib/api/schemas.ts`, or anything else.
   Do not import the old `lib/routes/*` files (they are on the way out).
5. **Retired**: `replication.*` groups (fs-based) — do not port.
6. **Verify**: run `bun run typecheck`; it must stay green (the only errors allowed
   are the 4 known pre-existing astro-check errors — typecheck must be clean).

## Group-specific notes

- **Authentication** (`authentication.client/server.ts`):
  - userLogin: validate `z_LoginCredentials`; on success create the session
    (existing `createSessionId`) + persist in `sys_users`, then
    `cookies.set(COOKIE.sessionId, session_id)`; response = `{ isValid: true, session_id }` (old shape).
  - userLogout: delete cookie + clear session row.
  - authenticateSession: read the cookie; return the matching `SysUsers` row (or error).
  - OAuth (`getGoogleOAuthState`, `oauthCallback`, signup variants): reuse the old
    logic (arctic), redirects via `APIServer.redirect(...)`; set cookie on success.
- **Registrations**: keep the transaction pattern + the POST-email fetch; the old
  flow's `insertId` etc. stay. `emailSubscribe`/`emailUnsubscribe`/
  `getSubscriptionToken` keep their shapes/schemas (`z_EmailSubscriptions` etc.).
- **Announcements**: `postImage`/`imagesDelete` are `multipart: true` with
  `z_AnnouncementImageUpload`-shaped schemas (define in-file); sitemap logic
  (`insertAnnouncementToSitemap`, `getSitemapXml` with self-init) moves as-is
  (uses `Bucket`); keep `fileData`/`thumbData` as Blob fields.
- **Teachers**: `teacherJoins`/`JoinedTeacher` are custom queries — keep them; the
  file upload routes (`fileUpload`) are multipart (`z_FileUpload`-shaped).
- **Locations**: `fileUpload` multipart; `update`/`quantity`-type contracts as in the old client file.
- **SysUsers**: registration-link flows (`createRegisterLink`, `validateRegisterLink`,
  `registerSysUser`) keep their token flows; the raw texts/messages stay Greek.
- **QueryLogs**: `getByFilters` validates `v_QueryLogsFilters` (port to zod in-file).
- **SettingsBackup**: `getDatabase` reuses the existing `sqliteGenerateBackup`
  (import from `@lib/routes/schema.server` — still present until retirement).
- **Schema**: port `get` (sqlite backup) to the new system (same handler body).

## Report back
Per route: ports done, any behavior risk you noticed (e.g., number parsing
differences, missing responseSchema), and the typecheck result.
