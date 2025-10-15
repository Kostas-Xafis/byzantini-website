import type { ObjectValuesToUnion } from "@_types/helpers.ts";
import type { Alert } from "@components/admin/Alert.solid.tsx";
import type { Page } from "@components/admin/table/Pagination.solid.tsx";
import type { TypeEffect } from "@hooks/useSelectedRows.solid.ts";

type HTMLElementTags = ObjectValuesToUnion<HTMLElementTagNameMap>;

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
		enable_input: CustomEvent<boolean>;
		onTablePageChange: CustomEvent<Page>;
	}
	interface Document {
		querySelector<K extends HTMLElementTags = HTMLElement>(selectors: string): K | null;
		querySelectorAll<K extends HTMLElementTags = HTMLElement>(selectors: string): NodeListOf<K>;
	}

	// interface Event {
	// 	currentTarget: HTMLElementTags | null;
	// }
}

export { };
