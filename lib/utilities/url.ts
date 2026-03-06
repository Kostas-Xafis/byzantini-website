import type { APIContext } from "astro";

export function convertToUrlFromArgs(url: string, args: any): string {
    let newUrl = url.slice();
    url.split("/")
        .filter(part => part.startsWith("["))
        .forEach(part => {
            const [name, _] = part.slice(1, -1).split(":");
            newUrl = newUrl.replace(part, args[name]);
        });
    return newUrl;
};
export function isSafeURLPath(url: string): boolean {
    return url.match(/^[\p{L}\w '$_.,+!*()-]+$/gu)?.at(0) === url;
}

export function getUrlSearchParams(url: string): Record<string, string> {
    const params: Record<string, string> = {};
    const u = new URL(url, "http://localhost");
    u.searchParams.forEach((value, key) => {
        params[key] = value;
    });
    return params;
}

export function getOriginFromContext(ctx?: APIContext) {
    if (ctx != undefined) {
        return ctx.url.origin;
    } else if (typeof window !== "undefined") {
        return window.location.origin;
    } else {
        throw new Error("No context or window available to determine origin");
    }
}