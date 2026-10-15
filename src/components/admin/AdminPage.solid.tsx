import type { RouterProps } from "@solidjs/router";
import { Show } from "solid-js";
import AdminNav from "./AdminNav.solid";
import AlertStack from "./Alert.solid";
import GlobalSearch from "./GlobalSearch.solid";
import { useCurrentUser } from "./currentUser";

export default function AdminPage(props: RouterProps) {
	// Owner-only feature (see @env/ownerEmail), decided by the server (`Authentication.me`).
	const user = useCurrentUser();

	return (
		<div
			id="AdminPage"
			class="box-border p-0 grid overflow-y-hidden max-sm:grid-cols-1 max-sm:grid-rows-[max-content_94dvh] max-sm:h-dvh dark:bg-[#19070a]!">
			<AdminNav {...props} />
			<AlertStack />
			<Show when={user()?.isOwner}>
				<GlobalSearch />
			</Show>
		</div>
	);
}
