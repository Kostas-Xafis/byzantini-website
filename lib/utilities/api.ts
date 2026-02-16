export function getAPIBaseURL(): string {
    const { VITE_URL = "", SITE = "" } = import.meta.env;
    return import.meta.env.SSR ? (SITE || VITE_URL) : "";
}
