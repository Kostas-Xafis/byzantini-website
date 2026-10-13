import type { EnvTypes } from "@_types/env";
import { runtimeEnv } from "./runtime";

/**
 * Server-side env: the ONE accessor for vars and secrets.
 *
 * `getEnv()` merges, once, two sources (later wins):
 * 1. `import.meta.env`: the Vite/Astro built-ins (`MODE`, `DEV`, `PROD`, `SSR`, `BASE_URL`, `SITE`), the `.env` values in dev
 *    and, under `bun test`, `process.env` (Bun aliases it);
 * 2. the `cloudflare:workers` runtime env (`./runtime`): CF secrets/vars in production, so they win over anything inlined.
 *
 * Values are kept exactly as their source provides them, with no coercion: a secret such as `"1e3"` or `"true"` stays that
 * string, and `PROD`/`DEV` stay the booleans Vite defines.
 *
 * Memoising on the first call is safe. In workerd the runtime env (bindings, secrets, vars) is fixed for the isolate's
 * lifetime: a deploy or a secret change starts new isolates. Under the Vite dev server an `.env` change restarts the
 * server and an edit to this module re-evaluates it, so neither keeps a stale copy.
 *
 * Bindings (`DB`, `S3_BUCKET`, `EMAIL_SERVICE`, ...) are read from `runtimeEnv` or the handler `env`, not from here.
 * This module may end up in the admin island's client bundle (route groups import it). It reads `import.meta.env` as a
 * whole, exactly like the old `Env` class did, so what Vite inlines there is unchanged (only `VITE_`/`PUBLIC_` vars) and
 * `runtimeEnv` is undefined in the browser.
 */
let merged: Readonly<EnvTypes> | undefined;

export function getEnv(): Readonly<EnvTypes> {
	return (merged ??= mergeEnv(import.meta.env, runtimeEnv));
}

/** The merge behind `getEnv` (pure, for the unit test): a frozen copy where `runtime` wins over `vite`, values untouched. */
export function mergeEnv(vite: Record<string, unknown> | undefined, runtime: Record<string, unknown> | undefined): Readonly<EnvTypes> {
	return Object.freeze({ ...vite, ...runtime }) as EnvTypes;
}
