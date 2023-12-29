import { type Setter, For } from "solid-js";
import { SortDirection } from "./Table.solid";
import { TypeEffectEnum, selectedRowsEvent } from "../../../../lib/hooks/useSelectedRows.solid";
import { getParent } from "../../../../lib/utils.client";

export type CellValue = "string" | "number" | "date" | "link" | "boolean";

interface Props {
	data: (number | string | undefined | null)[]; // data[0] must always be the id of the item
	columnTypes: CellValue[];
	hasSelectBox?: boolean;
	header?: boolean;
	sortOnClick?: Setter<[SortDirection, number]>;
}

export function toggleCheckbox(id: number, force?: boolean) {
	const cb = document.querySelector(`[data-id="${id}"] > .cb`) as HTMLElement;
	if (cb !== null) {
		// Toggling when there is a checkbox visible
		const row = getParent(cb, ".row") as HTMLElement;
		if (!row) return;
		const isSelected = row.classList.contains("selectedRow");
		if (force === true || force === false) {
			cb.classList.toggle("selected", force);
			row.classList.toggle("selectedRow", force);
			if (force === false) {
				selectedRowsEvent({ type: TypeEffectEnum.REMOVE, id });
			} else if (force === true) {
				selectedRowsEvent({ type: TypeEffectEnum.ADD, id });
			}
		} else {
			cb.classList.toggle("selected");
			row.classList.toggle("selectedRow");
			if (isSelected) {
				selectedRowsEvent({ type: TypeEffectEnum.REMOVE, id });
			} else {
				selectedRowsEvent({ type: TypeEffectEnum.ADD, id });
			}
		}
	} else {
		const row = document.querySelector(`.row[data-id='${id}']`);
		if (!row) return;
		const isSelected = row.classList.contains("selectedRow");
		if (isSelected && force !== false) {
			selectedRowsEvent({ type: TypeEffectEnum.REMOVE, id });
		} else if (!isSelected && force !== true) {
			selectedRowsEvent({ type: TypeEffectEnum.ADD, id });
		}
		row.classList.toggle("selectedRow");
	}
}

export function toggleCheckboxes(force?: boolean) {
	const allCbs = document.querySelectorAll<HTMLElement>(".cb");
	const mainCb = document.querySelector<HTMLElement>(".mcb");
	if (mainCb && allCbs.length) {
		//! If force toggling is specified
		if (force === true || force === false) {
			allCbs.forEach((cb) => {
				cb.classList.toggle("selected", force);
				//@ts-ignore
				cb.parentElement.classList.toggle("selectedRow", force);
			});
			mainCb.classList.toggle("selected", force);
			if (force === false) {
				selectedRowsEvent({ type: TypeEffectEnum.REMOVE_ALL });
			} else if (force === true) {
				const ids = [...allCbs].map(
					(el) => Number((el.parentElement as HTMLElement).dataset.id) //Get the id of the row;
				);
				selectedRowsEvent({ type: TypeEffectEnum.ADD_MANY, ids });
			}
		} else {
			const isSelected = mainCb.classList.contains("selected");
			allCbs.forEach((cb) => {
				cb.classList.toggle("selected", !isSelected);
				//@ts-ignore
				cb.parentElement.classList.toggle("selectedRow", !isSelected);
			});
			mainCb.classList.toggle("selected", !isSelected);
			if (isSelected) {
				selectedRowsEvent({ type: TypeEffectEnum.REMOVE_ALL });
			} else {
				const ids = [...allCbs].map(
					(el) => Number((el.parentElement as HTMLElement).dataset.id) //Get the id of the row
				);
				selectedRowsEvent({ type: TypeEffectEnum.ADD_MANY, ids });
			}
		}
	} else {
		//? Toggling all checkboxes too false should not be possible when there is not main checkbox,
		//? and therefore this is only available, when removing all selections after a search
		const allRows = document.querySelectorAll<HTMLElement>(".data-container .row");
		selectedRowsEvent({ type: TypeEffectEnum.REMOVE_ALL });
		allRows.forEach((row) => {
			row.classList.toggle("selectedRow", false);
		});
	}
}

export default function Row(props: Props) {
	const { data, columnTypes, header, sortOnClick, hasSelectBox } = props;

	let onClickSort: ((e: MouseEvent) => void) | undefined;
	if (header) {
		onClickSort = (e: MouseEvent) => {
			const el = e.currentTarget as HTMLElement;
			const sortedCol = document.querySelector("[data-asc], [data-desc]");
			let direction: SortDirection;
			if (sortedCol && sortedCol !== el) {
				sortedCol.removeAttribute("data-asc");
				sortedCol.removeAttribute("data-desc");
				el.setAttribute("data-asc", "");
				direction = SortDirection.ASCENDING;
			} else if (el.dataset.asc === "") {
				el.removeAttribute("data-asc");
				el.setAttribute("data-desc", "");
				direction = SortDirection.DESCENDING;
			} else if (el.dataset.desc === "") {
				el.removeAttribute("data-desc");
				direction = SortDirection.NONE;
			} else {
				el.setAttribute("data-asc", "");
				direction = SortDirection.ASCENDING;
			}
			const column_index = Number(el.dataset.colInd as string);
			sortOnClick && sortOnClick([direction, column_index]);
		};
	}

	return (
		<>
			<div
				data-id={data[0]}
				class={
					"row max-sm:text-sm" +
					(header
						? " header absolute top-0 left-0 right-0 shadow-md shadow-gray-500 rounded-t-xl before:content-[none] hover:shadow-gray-500  before:!bg-white border-b-2 border-b-red-900"
						: "")
				}>
				{hasSelectBox && (
					<div
						class={
							"group/checkbox relative w-full items-center" +
							(header ? " mcb" : " cb") // mcb = main checkbox, cb = checkbox
						}>
						<i class="selectBox fa-regular fa-square group-[:is(.selected)]/checkbox:hidden"></i>
						<i class="selectBox fa-solid fa-square-check group-[:is(:not(.selected))]/checkbox:hidden"></i>
					</div>
				)}
				<For each={data}>
					{(item, colIndex) => {
						if (item === undefined || item === null || item === "") {
							item = "-";
						} else {
							let type = (!header && columnTypes[colIndex()]) || ""; // If it's a header row there is no type
							if (type === "link") {
								return (
									<a
										href={item as string}
										target="_blank"
										class="grid grid-cols-[auto_auto] place-items-center underline underline-offset-1">
										<i class="fa-solid fa-up-right-from-square text-red-900"></i>
									</a>
								);
							}
							if (type === "date" && item !== 0)
								item = new Date(item as number).toLocaleDateString("el-GR");
							if (type === "boolean") item = !!item ? "Ναι" : "Όχι";
						}
						return (
							<p
								class={
									"cell" +
									(header
										? " group/head grid h-full items-center data-[asc]:bg-red-900 data-[desc]:bg-red-900 data-[asc]:text-white data-[desc]:text-white"
										: "")
								}
								data-col-ind={header && colIndex()}
								onClick={onClickSort}>
								{header ? (
									<>
										<span class="group-data-[asc]/head:pr-[1.5ch] group-data-[desc]/head:pr-[1.5ch]">
											{item}
										</span>
										<i class="absolute text-sm right-0 top-[50%] translate-x-[-50%] translate-y-[-40%] fa-solid fa-chevron-up hidden group-data-[asc]/head:flex"></i>
										<i class="absolute text-sm right-0 top-[50%] translate-x-[-50%] translate-y-[-40%] fa-solid fa-chevron-down hidden group-data-[desc]/head:flex"></i>
									</>
								) : (
									item
								)}
							</p>
						);
					}}
				</For>
			</div>
		</>
	);
}
