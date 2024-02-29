import type { TypeEffect } from "../lib/hooks/useSelectedRows.solid.ts";
import type { Alert } from "./components/admin/Alert.solid.tsx";

declare global {
	// Better alternative that covers all elements and not just Document
	interface GlobalEventHandlersEventMap {
		hydrate: CustomEvent<undefined>;
		open_carousel: CustomEvent<{ index: number; }>;
		close_carousel: CustomEvent<undefined>;
		modify_selections: CustomEvent<TypeEffect>;
		modal_close: CustomEvent<{ prefix: string; }>;
		push_alert: CustomEvent<Alert>;
		update_alert: CustomEvent<Alert>;
	}
}

export { };
