import type { IconName } from "@lib/icons";

export const enum ActionEnum {
	ADD = "ADD",
	MODIFY = "MODIFY",
	DELETE = "DELETE",
	CHECK = "CHECK",
	DOWNLOAD_PDF = "PDF",
	DOWNLOAD_EXCEL = "EXCEL",
	PRINT = "PRINT",
	NONE = "",
}

/** Icon of each table action (lib/icons.ts). */
export const ActionIcon = {
	ADD: "plus",
	MODIFY: "edit",
	DELETE: "trash",
	CHECK: "check",
	ADD_USER: "user-plus",
	DELETE_USER: "user-minus",
	ADD_BOX: "square-plus",
	DELETE_BOX: "square-minus",
	DOWNLOAD_SINGLE: "download",
	DOWNLOAD_ZIP: "file-zip",
	DOWNLOAD_EXCEL: "table",
	PRINT: "printer",
} as const satisfies Record<string, IconName>;
export type ActionIcon = (typeof ActionIcon)[keyof typeof ActionIcon];

export type EmptyAction = {
	type: ActionEnum;
	icon: ActionIcon;
};
