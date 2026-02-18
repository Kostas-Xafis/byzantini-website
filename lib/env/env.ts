import type { EnvTypes } from "@_types/env";
import type { APIContext } from "astro";

export class Env {
    static #_env: EnvTypes = {} as EnvTypes;
    static #initialized = 0;

    static get env(): EnvTypes {
        if (this.#initialized === 3) {
            Object.defineProperty(Env, "env", {
                get() {
                    return this.#_env;
                }
            });
        }
        if (this.#initialized !== 1) {
            Env.setEnv(null as any);
        }
        return this.#_env;
    }

    static setEnv(ctx: APIContext) {
        if (this.#initialized >= 3) return;
        const ime = (import.meta.env && { ...import.meta.env }) || null;
        const rnv = ctx?.locals.runtime.env || null;
        if (ime || rnv) {
            const env = { ...ime, ...rnv };
            for (const key in env) {
                //@ts-ignore
                this.#_env[key] = env[key];
            }
            if (ctx) {
                this.#initialized += 2;
            }
            if (import.meta.env) {
                this.#initialized += 1;
            }
        }
        if (this.#initialized === 3) {
            console.log("Environment variables loaded from both import.meta.env and runtime env.");
        }
    }
}