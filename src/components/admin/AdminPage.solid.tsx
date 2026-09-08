import type { RouterProps } from "@solidjs/router";
import { Show } from "solid-js";
import { isOwnerEmail } from "@env/ownerEmail";
import AdminNav from "./AdminNav.solid";
import AlertStack from "./Alert.solid";
import GlobalSearch from "./GlobalSearch.solid";

export default function AdminPage(props: RouterProps) {
	// Owner-only feature (see @env/ownerEmail): the admin session stores the
	// logged-in user locally, so the same state the nav uses is available here.
	// Read inside the component — this module is also imported during SSR.
	const user = JSON.parse(localStorage.getItem("sys_user") || "{}") as { email?: string | null };

	return (
		<div id="AdminPage" class="box-border p-0 grid max-sm:flex flex-col max-sm:h-max  dark:bg-dark">
			<AdminNav {...props} />
			<AlertStack />
			<Show when={isOwnerEmail(user.email)}>
				<GlobalSearch />
			</Show>
		</div>
	);
}
