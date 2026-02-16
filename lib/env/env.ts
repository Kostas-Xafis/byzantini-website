import type { EnvTypes } from "@_types/env";
import type { APIContext } from "astro";

export class Env {
    static _env: EnvTypes = {} as EnvTypes;
    static initialized = false;

    static get env(): EnvTypes {
        if (!this.initialized) this.setEnv(undefined);
        return this._env;
    }

    static setEnv(ctx: APIContext | undefined) {
        if (this.initialized) return;
        const env =
            ((ctx && ctx.locals && (ctx.locals as any).runtime)
                && (ctx.locals as any).runtime.env)
            || import.meta.env;
        if (env) {
            for (const key in env) {
                //@ts-ignore
                this._env[key] = env[key];
            }
            this.initialized = true;
            Env.setEnv = function () { };
        } else {
            throw new Error("Failed to initialize environment variables. No valid source found.");
        }
    }
}