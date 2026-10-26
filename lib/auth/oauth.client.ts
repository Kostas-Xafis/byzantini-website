import { apiCall } from "@hooks/apiCall";
import type { APIArgs } from "@routes/index.client";

/**
 * Browser half of a provider sign-in: asks the server for the provider's authorization URL (the server
 * sets the signed `oauth_flow` cookie) and leaves for it. Throws with the server's (Greek) message.
 */
export async function startOAuth(provider: string, request: APIArgs["Authentication.oauthStart"]["RequestObject"]) {
	const res = await apiCall("Authentication.oauthStart", { UrlArgs: { provider }, RequestObject: request });
	if (!("data" in res) || !res.data.OAuthUrl) throw new Error("Δεν ήταν δυνατή η έναρξη της σύνδεσης");
	window.location.assign(res.data.OAuthUrl);
}

/** Wires every `[data-provider]` button of the page to `startOAuth`; errors go to `onError`. */
export function bindProviderButtons(request: () => APIArgs["Authentication.oauthStart"]["RequestObject"], onError: (message: string) => void) {
	const buttons = document.querySelectorAll<HTMLButtonElement>("[data-provider]");
	// Back from the provider restores this page from the bfcache with the clicked button still disabled.
	window.addEventListener("pageshow", () => buttons.forEach((button) => (button.disabled = false)));
	buttons.forEach((button) => {
		button.addEventListener("click", async () => {
			button.disabled = true;
			try {
				await startOAuth(button.dataset.provider!, request());
			} catch (error) {
				onError(error instanceof Error ? error.message : String(error));
				button.disabled = false;
			}
		});
	});
}
