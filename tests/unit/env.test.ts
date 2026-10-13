/**
 * Unit tests for lib/env/env.ts — the merged server env (`getEnv`).
 *
 * `mergeEnv` is the pure merge; `getEnv` is that merge applied once to
 * `import.meta.env` and the `cloudflare:workers` runtime env. Under `bun test`
 * there is no workerd, so the runtime env is undefined and `import.meta.env` is
 * Bun's alias of `process.env`: no dev server, no DB, no env file needed.
 */
import { expect, test } from "bun:test";
import { getEnv, mergeEnv } from "@env/env";
import { runtimeEnv } from "@env/runtime";

test("mergeEnv: the runtime env (CF secrets/vars) wins over import.meta.env", () => {
	const env = mergeEnv({ MODE: "production", SECRET: "inlined", GOOGLE_CLIENT_ID: "vite-only" }, { SECRET: "cf-secret" });
	expect(env.SECRET).toBe("cf-secret");
	expect(env.MODE).toBe("production");
	expect(env.GOOGLE_CLIENT_ID).toBe("vite-only");
});

test("mergeEnv: keeps values verbatim (no number/boolean/null coercion)", () => {
	const raw = { A: "1e3", B: "true", C: "FALSE", D: "null", E: "undefined", F: " 42 ", G: "007", H: "0x1f", I: "" };
	const env = mergeEnv(raw, { J: "1.0" }) as Record<string, unknown>;
	expect(env).toEqual({ ...raw, J: "1.0" });
	for (const value of Object.values(env)) expect(typeof value).toBe("string");
});

test("mergeEnv: keeps the real booleans Vite defines (isProduction relies on PROD === true)", () => {
	const env = mergeEnv({ MODE: "production", PROD: true, DEV: false }, undefined);
	expect(env.PROD).toBe(true);
	expect(env.DEV).toBe(false);
});

test("mergeEnv: tolerates a missing source and returns a frozen copy", () => {
	const vite: Record<string, unknown> = { MODE: "development" };
	const env = mergeEnv(vite, undefined);
	vite.MODE = "changed";
	expect(env.MODE).toBe("development");
	expect(Object.isFrozen(env)).toBe(true);
	expect(Object.keys(mergeEnv(undefined, undefined))).toEqual([]);
});

test("getEnv: memoised, read-only, a verbatim copy of import.meta.env under bun test", () => {
	expect(runtimeEnv).toBeUndefined();
	const env = getEnv();
	expect(getEnv()).toBe(env);
	expect(Object.isFrozen(env)).toBe(true);
	expect((env as Record<string, unknown>).PATH).toBe(process.env.PATH);
});
