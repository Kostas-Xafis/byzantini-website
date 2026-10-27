import type { ObjectValuesToUnion } from "@_types/helpers.ts";
import type { Alert } from "@components/admin/toast.ts";
import type { Page } from "@components/admin/table/Pagination.solid.tsx";
import type { TypeEffect } from "@hooks/useSelectedRows.solid.ts";
import type { ToastCommand } from "@utilities/toastStore.ts";

type HTMLElementTags = ObjectValuesToUnion<HTMLElementTagNameMap>;

declare global {
	// Better alternative that covers all elements and not just Document
	interface GlobalEventHandlersEventMap {
		hydrate: CustomEvent<undefined>;
		/** Opens the photo viewer (src/components/other/PhotoViewer.astro) at a photo. */
		photo_viewer_open: CustomEvent<{ index: number }>;
		modify_selections: CustomEvent<TypeEffect>;
		modal_close: CustomEvent<{ prefix: string }>;
		/** Admin toasts (src/components/admin/toast.ts → <AlertStack />). */
		admin_toast: CustomEvent<ToastCommand>;
		/** Legacy alert events, still bridged by <AlertStack /> (prefer `toast.*` / `pushAlert`). */
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

export {};
