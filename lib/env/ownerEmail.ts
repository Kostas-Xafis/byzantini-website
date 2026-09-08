/**
 * Owner (super-admin) email — the single source of truth for owner-only UI and
 * backend checks (global search, query-log visibility, user management).
 *
 * Resolution order:
 * 1. `VITE_OWNER_EMAIL` from the Vite-native env files (`.env`, `.env.production`)
 *    — inlined by Vite into BOTH client and server bundles, so the same value
 *    works in Astro/Solid components and API route code.
 * 2. Hardcoded fallback so owner-only features work out of the box on fresh
 *    checkouts (the fallback is the project owner; env files are gitignored).
 *
 * Components/routes should use `isOwnerEmail(...)` rather than comparing
 * against a locally hardcoded email.
 */
const DEFAULT_OWNER_EMAIL = "koxafis@gmail.com";

export const OWNER_EMAIL: string = (import.meta.env?.VITE_OWNER_EMAIL as string | undefined) || DEFAULT_OWNER_EMAIL;

export const isOwnerEmail = (email?: string | null): boolean => !!email && email === OWNER_EMAIL;
