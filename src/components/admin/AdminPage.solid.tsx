import type { RouterProps } from "@solidjs/router";
import AdminNav from "./AdminNav.solid";
import AlertStack from "./Alert.solid";

export default function AdminPage(props: RouterProps) {
	return (
		<div id="AdminPage" class="box-border p-0 grid overflow-y-hidden max-sm:grid-cols-1 max-sm:grid-rows-[max-content_minmax(0,1fr)] max-sm:h-dvh bg-page">
			<AdminNav {...props} />
			<AlertStack />
		</div>
	);
}
