import type { TypeEffect } from "@hooks/useSelectedRows.solid";
import type { Alert } from "@components/admin/Alert.solid";
import type { Page } from "@components/admin/table/Pagination.solid";

export type CustomEvents = {
	hydrate: CustomEvent<undefined>;
	open_carousel: CustomEvent<{ index: number; }>;
	close_carousel: CustomEvent<undefined>;
	modify_selections: CustomEvent<TypeEffect>;
	modal_close: CustomEvent<{ prefix: string; }>;
	push_alert: CustomEvent<Alert>;
	update_alert: CustomEvent<Alert>;
	enable_input: CustomEvent<boolean>;
	show: CustomEvent<void>;
	onTablePageChange: CustomEvent<Page>;
};

export function customEvent<K extends keyof CustomEvents>(name: K, detail?: CustomEvents[K]["detail"]) {
	return new CustomEvent(name, { detail });
}
