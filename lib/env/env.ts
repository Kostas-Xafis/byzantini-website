import type { EnvTypes } from "@_types/env";
import { isEmptyObject } from "@utilities/objects";
import type { APIContext } from "astro";

export class Env {
    static #_env: EnvTypes = {} as EnvTypes;
    static #initialized = 0;

    static get env(): EnvTypes {
        return this.#_env;
    }

    static setEnv(ctx: APIContext | undefined) {
        if (this.#initialized >= 3) return;
        const ime = (import.meta.env && { ...import.meta.env }) || {};
        const rnv = ((ctx?.locals as any).runtime.env) || {};
        if (!isEmptyObject(ime) && !isEmptyObject(rnv)) {
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
        console.log(`Environment initialized with ${this.#initialized} sources. Current env:`, this.#_env);
    }
}