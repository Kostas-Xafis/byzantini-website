import { Env } from "@env/env";

export function getAPIBaseURL(): string {
    const { VITE_URL = "", SITE = "" } = Env.env;
    return Env.env.SSR ? (SITE || VITE_URL) : "";
}
