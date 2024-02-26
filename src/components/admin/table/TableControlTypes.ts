export const enum ActionEnum {
	ADD = "ADD",
	MODIFY = "MODIFY",
	DELETE = "DELETE",
	CHECK = "CHECK",
	DOWNLOAD_PDF = "PDF",
	DOWNLOAD_EXCEL = "EXCEL",
	NONE = "",
}

export const enum ActionIcon {
	ADD = "fa-solid fa-plus",
	MODIFY = "fa-regular fa-pen-to-square",
	DELETE = "fa-regular fa-trash-can",
	CHECK = "fa-solid fa-check",
	ADD_USER = "fa-solid fa-user-plus",
	DELETE_USER = "fa-solid fa-user-minus",
	ADD_BOX = "fa-regular fa-square-plus",
	DELETE_BOX = "fa-regular fa-square-minus",
	DOWNLOAD_SINGLE = "fa-solid fa-download",
	DOWNLOAD_ZIP = "fa-regular fa-file-zipper",
	DOWNLOAD_EXCEL = "fa-solid fa-table",
}

export type EmptyAction = {
	type: ActionEnum;
	icon: ActionIcon;
};
