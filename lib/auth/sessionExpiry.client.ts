import { buildLoginUrl, currentRedirectTarget } from "@utilities/redirect";

/**
 * What happens when the admin's session ends while the panel is open (7-day expiry, «Αποσύνδεση» from
 * another device, a deleted account): instead of every action failing with an error toast, the admin is
 * sent to the sign-in screen with «Η συνεδρία σας έληξε», and comes back to the same page afterwards.
 *
 * Triggered by any 401 from the API (`apiCall`, `lib/pdf.client.ts`) and checked when a dashboard tab
 * becomes visible again (`watchSession`). Only the dashboard reacts — public pages never get a 401.
 */
let leaving = false;

export function onSessionExpired() {
	if (typeof window === "undefined" || leaving) return;
	if (!window.location.pathname.startsWith("/admin")) return;
	leaving = true;
	window.location.assign(buildLoginUrl(currentRedirectTarget(), { expired: true }));
}

/** Re-check at most this often when the tab comes back into view. */
const RECHECK_MS = 60_000;

/**
 * Checks the session now and whenever the tab becomes visible again (a laptop woken up the next morning),
 * so the admin is not left editing a form that can no longer be saved. `check` answers false or throws a
 * 401 (`apiCall` then redirects by itself) when the session is gone; network errors keep the page.
 */
export function watchSession(check: () => Promise<boolean>) {
	let lastCheck = 0;
	const run = async () => {
		lastCheck = Date.now();
		try {
			if (!(await check())) onSessionExpired();
		} catch (error) {
			console.warn("[admin] session check failed, staying on the page:", error);
		}
	};
	void run();
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible" && Date.now() - lastCheck > RECHECK_MS) void run();
	});
}
