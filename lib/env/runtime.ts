/**
 * Access to the Workers runtime env (bindings, vars, secrets) via the
 * `cloudflare:workers` module.
 *
 * `@astrojs/cloudflare` v14: `Astro.locals.runtime` no longer carries `env`
 * (Runtime is just `{ cfContext }`), so this is the supported way to read the
 * runtime environment (see `~/Projects/Isokratis` for the same pattern).
 *
 * Guarded & lazy: under `bun test` (no workerd) the module does not resolve
 * and we fall back to `undefined` — tests rely on `import.meta.env` only.
 */

let runtimeEnv: Record<string, any> | undefined;

try {
	runtimeEnv = (await import(/* @vite-ignore */ "cloudflare:workers" as string)).env;
} catch {
	runtimeEnv = undefined;
}

export { runtimeEnv };
