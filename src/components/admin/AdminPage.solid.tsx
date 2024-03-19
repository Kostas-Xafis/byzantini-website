import type { RouterProps } from "@solidjs/router";
import AdminNav from "./AdminNav.solid";
import AlertStack from "./Alert.solid";

export default function AdminPage(props: RouterProps) {
	return (
		<div
			id="AdminPage"
			class="box-border p-0 grid max-sm:flex flex-col max-sm:h-max  dark:bg-dark">
			<AdminNav {...props} />
			<AlertStack />
		</div>
	);
}
