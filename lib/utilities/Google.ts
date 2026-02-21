import { Env } from "@env/env";
import { Google } from "arctic";
import { getOriginFromContext } from "./url";
import type { APIContext } from "astro";

export function google(ctx?: APIContext) {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = Env.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        throw new Error("Google Client ID or Secret not set in environment variables");
    }
    return new Google(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        `${getOriginFromContext(ctx)}/oauth2callback`
    );
};
