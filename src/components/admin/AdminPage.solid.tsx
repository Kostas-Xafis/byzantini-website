import type { RouterProps } from "@solidjs/router";
import AdminNav from "./AdminNav.solid";
import AlertStack from "./Alert.solid";

export default function AdminPage(props: RouterProps) {
	return (
		<>
			<AdminNav {...props} />
			<AlertStack />
		</>
	);
}
