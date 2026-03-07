import type { EnvTypes, TestEnvTypes } from "@_types/env";
import type { APIContext } from "astro";

const isPrimitive = (val: any) => {
    // Check if the value is a primitive type (number, boolean, null, undefined)
    return (typeof val === "number" || typeof val === "boolean" || typeof val === "undefined" || val === null);
};

export class Env {
    static #_env: EnvTypes = {} as any;
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
                if (typeof env[key] === "string") {
                    //Convert possibly string primitives to primitives of their respective types
                    if (env[key] === "true" || env[key] === "True" || env[key] === "TRUE") {
                        env[key] = true;
                    } else if (env[key] === "false" || env[key] === "False" || env[key] === "FALSE") {
                        env[key] = false;
                    } else if (!isNaN(env[key]) && env[key].trim() !== "") {
                        env[key] = Number(env[key]);
                    } else if (env[key] === "null") {
                        env[key] = null;
                    } else if (env[key] === "undefined") {
                        env[key] = undefined;
                    }
                }
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

    static get testEnv(): TestEnvTypes {
        return this.env as TestEnvTypes;
    }
}