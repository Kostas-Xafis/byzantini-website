import { type Setter, For } from "solid-js";
import { SortDirection } from "./Table.solid";
import {
	TypeEffectEnum,
	type TypeEffect,
} from "../../../../lib/hooks/useSelectedRows.solid";

export type CellValue = "string" | "number" | "date" | "link" | "boolean";

interface Props {
	data: (number | string)[]; // data[0] must always be the id of the item
	columnType: CellValue[];
	hasSelectBox: boolean;
	index?: number;
	header?: boolean;
	sortOnClick?: Setter<[SortDirection, number]>;
}

export function toggleCheckboxes(force?: boolean) {
	const allCbs = document.querySelectorAll<HTMLElement>(".cb");
	const mainCb = document.querySelector<HTMLElement>(".mcb");
	const ids = [...allCbs].map((el) => Number(el.dataset.value));
	if (mainCb !== null && allCbs.length !== 0) {
		if (force === true || force === false) {
			allCbs.forEach((cb) => {
				cb.classList.toggle("selected", force);
				//@ts-ignore
				cb.parentElement.parentElement.classList.toggle(
					"selectedRow",
					force
				);
			});
			mainCb.classList.toggle("selected", force);
		} else {
			allCbs.forEach((cb) => {
				cb.classList.toggle("selected");
				//@ts-ignore
				cb.parentElement.parentElement.classList.toggle("selectedRow");
			});
			mainCb.classList.toggle("selected");
		}
	}
	if (force === false) {
		document.dispatchEvent(
			new CustomEvent("ModifySelections", {
				detail: { type: TypeEffectEnum.REMOVE_ALL } as TypeEffect,
			})
		);
	} else if (force === true) {
		document.dispatchEvent(
			new CustomEvent("ModifySelections", {
				detail: { type: TypeEffectEnum.ADD_MANY, ids } as TypeEffect,
			})
		);
	}
}

export default function Row(props: Props) {
	const {
		data,
		index = -1,
		columnType,
		header,
		sortOnClick,
		hasSelectBox,
	} = props;

	const onClickHeader = header
		? (e: MouseEvent) => toggleCheckboxes()
		: undefined;
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
				data-index={index}
				class={
					"row relative grid grid-flow-col justify-between justify-items-center items-center h-min px-8 gap-x-2 text-center text-lg max-sm:text-sm bg-transparent" +
					" hover:shadow-md hover:shadow-gray-400 before:content-[''] before:absolute before:inset-0 before:-z-10 odd:before:bg-gray-100" +
					(props?.header
						? " header absolute top-0 left-0 right-0 shadow-md shadow-gray-500 rounded-t-xl before:content-[none] hover:shadow-gray-500"
						: "")
				}
			>
				{hasSelectBox && (
					<div class="relative w-full">
						<div
							onClick={onClickHeader}
							class={
								"group/checkbox relative items-center" +
								(header ? " mcb" : " cb") // mcb = main checkbox, cb = checkbox
							}
							data-value={data[0]}
						>
							<i class="absolute top-[50%] translate-y-[-50%] left-0 width-[16px] text-gray-700 fa-regular fa-square group-[:is(.selected)]/checkbox:hidden"></i>
							<i class="absolute top-[50%] translate-y-[-50%] left-0 width-[16px] text-gray-700 fa-solid fa-square-check group-[:is(:not(.selected))]/checkbox:hidden"></i>
						</div>
					</div>
				)}
				<For each={data}>
					{(item, colIndex) => {
						if (item === undefined || item === null) {
							item = "-";
						} else {
							let type =
								(!header && columnType[colIndex()]) || ""; // If it's a header row there is no type
							if (type === "link" && item) {
								return (
									<a
										href={item as string}
										target="_blank"
										class="grid grid-cols-[auto_auto] place-items-center underline underline-offset-1"
									>
										<div>Προβολή</div>
										<i class="fa-solid fa-up-right-from-square"></i>
									</a>
								);
							} else if (type === "link") {
								item = "-";
							}
							if (type === "date" && item)
								item = new Date(
									item as number
								).toLocaleDateString("el-GR");
							if (type === "boolean")
								item = !!item ? "Ναι" : "Όχι";
							if (type === "string" && item === "") item = "-";
						}
						return (
							<div
								class={
									"group/sort relative w-full data-[asc]:bg-red-900 data-[desc]:bg-red-900 data-[asc]:text-white data-[desc]:text-white py-2" +
									(header
										? " group/head grid h-full items-center "
										: "")
								}
								data-col-ind={colIndex()}
								onClick={onClickSort}
							>
								<p class="group-data-[asc]/sort:text-white group-data-[desc]/sort:text-white">
									{item}
								</p>
								{props?.header && (
									<>
										<i class="absolute text-sm right-0 top-[50%] translate-x-[-50%] translate-y-[-40%] fa-solid fa-chevron-up hidden group-data-[asc]/head:flex"></i>
										<i class="absolute text-sm right-0 top-[50%] translate-x-[-50%] translate-y-[-40%] fa-solid fa-chevron-down hidden group-data-[desc]/head:flex"></i>
									</>
								)}
							</div>
						);
					}}
				</For>
			</div>
		</>
	);
}
