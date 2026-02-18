export function getAPIBaseURL(): string {
    const { VITE_URL = "", SITE = "", DEV = false } = import.meta.env;
    if (!import.meta.env.SSR) return "";
    return DEV ? (VITE_URL || "") : (SITE || VITE_URL);
}
