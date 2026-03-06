export type DashboardTheme = "light" | "dark";

export const DASHBOARD_THEME_STORAGE_KEY = "dashboard-theme";

function isDashboardTheme(value: string | null): value is DashboardTheme {
    return value === "light" || value === "dark";
}

export function getStoredDashboardTheme(): DashboardTheme | null {
    if (typeof window === "undefined") return null;
    const storedTheme = window.localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY);
    if (!isDashboardTheme(storedTheme)) return null;
    return storedTheme;
}

export function getSystemDashboardTheme(): DashboardTheme {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveDashboardTheme(): DashboardTheme {
    return getStoredDashboardTheme() ?? getSystemDashboardTheme();
}

type ApplyDashboardThemeOptions = {
    persist?: boolean;
};

export function applyDashboardTheme(
    theme: DashboardTheme,
    options: ApplyDashboardThemeOptions = {},
) {
    if (typeof document === "undefined") return;

    const { persist = true } = options;
    const root = document.documentElement;

    root.classList.toggle("dark", theme === "dark");
    root.dataset.dashboardTheme = theme;

    if (persist && typeof window !== "undefined") {
        window.localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, theme);
    }
}

export function toggleDashboardTheme() {
    if (typeof document === "undefined") return "light" as DashboardTheme;
    const currentTheme = document.documentElement.classList.contains("dark") ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    applyDashboardTheme(nextTheme);
    return nextTheme;
}

export function isDashboardDarkMode() {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
}