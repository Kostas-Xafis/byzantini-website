import { apiCall } from "@hooks/apiCall";
import type { APIResponse } from "@routes/index.client";
import { createSignal } from "solid-js";

/**
 * The signed-in admin (`Authentication.me`), fetched once per page load and shared by the nav, the
 * owner-only features and «Ο λογαριασμός μου». It replaces the `sys_user` copy the sign-in pages used to
 * keep in localStorage, which went stale and survived a switch to another admin on the same browser.
 */
export type CurrentUser = APIResponse["Authentication.me"];

const [currentUser, setCurrentUser] = createSignal<CurrentUser | undefined>(undefined);
let pending: Promise<void> | undefined;

export function refreshCurrentUser(): Promise<void> {
	pending = apiCall("Authentication.me")
		.then((res) => {
			if ("data" in res) setCurrentUser(res.data);
		})
		.catch((error) => console.error("[currentUser]", error));
	return pending;
}

/** Reactive accessor; the first call starts the fetch. */
export function useCurrentUser() {
	if (!pending && typeof window !== "undefined") {
		localStorage.removeItem("sys_user");
		void refreshCurrentUser();
	}
	return currentUser;
}
