import { type Setter, useContext } from "solid-js";
import {
	type ContextType,
	SelectedItemsContext,
} from "./SelectedRowContext.solid";
import { SortDirection } from "./Table.solid";

export type CellValue = "string" | "number" | "date" | "link" | "boolean";

interface Props {
	data: (number | string)[]; // data[0] must always be the id of the item
	columnType: CellValue[];
	hasSelectBox: boolean;
	index?: number;
	header?: boolean;
	sortOnClick?: Setter<[SortDirection, number]>;
}

export default function Row(props: Props) {
	const [selectedItems, { add, remove, addMany, removeMany, removeAll }] =
		useContext(SelectedItemsContext) as ContextType;
	const {
		data,
		index = -1,
		columnType,
		header,
		sortOnClick,
		hasSelectBox,
	} = props;

	const onClick = (e: MouseEvent) => {
		if (header) return;
		const item_id = Number(
			(e.currentTarget as HTMLElement).dataset.id as string
		);
		const isSelected = selectedItems.includes(item_id);
		if (isSelected) remove && remove(item_id);
		else add && add(item_id);
		(e.currentTarget as HTMLElement).classList.toggle("selectedRow");

		if (hasSelectBox)
			document
				.querySelector(`.cb[data-value="${item_id}"]`)
				?.classList.toggle("selected");
	};
	const onClickHeader = header
		? (e: MouseEvent) => {
				const allCbs = document.querySelectorAll<HTMLElement>(".cb");
				const mainCb = document.querySelector<HTMLElement>(
					".mcb"
				) as HTMLElement;
				const ids = [...allCbs].map((el) => Number(el.dataset.value));
				const isSelected = mainCb.classList.contains("selected");
				allCbs.forEach((cb) => {
					cb.classList.toggle("selected", !isSelected);
					//@ts-ignore
					cb.parentElement.parentElement.classList.toggle(
						"selectedRow",
						!isSelected
					);
				});
				mainCb.classList.toggle("selected");
				if (isSelected) removeAll();
				else addMany(ids);
		  }
		: () => {};
	let onClickSort: (e: MouseEvent) => void;
	if (header) {
		onClickSort = (e: MouseEvent) => {
			const el = e.currentTarget as HTMLElement;
			const isSorted = document.querySelector("[data-asc], [data-desc]");
			let direction: SortDirection;
			if (isSorted && isSorted !== el) {
				isSorted.removeAttribute("data-asc");
				isSorted.removeAttribute("data-desc");
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
				onClick={onClick}
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
				{data.map((item, colIndex) => {
					let type = (!header && columnType[colIndex]) || ""; // If it's a header row there is no type
					if (type === "link" && item)
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
					if (type === "date" && item) {
						item = new Date(item as number).toLocaleDateString(
							"el-GR"
						);
					} else if (type === "date") item = "-";
					if (type === "boolean") item = !!item ? "Ναι" : "Όχι";
					if (
						type === "number" &&
						(item === undefined || item === null)
					)
						item = "-";
					return (
						<div
							class={
								"relative w-full data-[asc]:bg-red-900 data-[asc]:text-white data-[desc]:bg-red-900 data-[desc]:text-white py-2 " +
								(header ? " group/head" : "")
							}
							data-col-ind={colIndex}
							onClick={onClickSort}
						>
							{item}
							<i class="absolute text-sm right-0 top-[50%] translate-x-[-50%] translate-y-[-50%] fa-solid fa-chevron-up hidden group-data-[asc]/head:flex"></i>
							<i class="absolute text-sm right-0 top-[50%] translate-x-[-50%] translate-y-[-50%] fa-solid fa-chevron-down hidden group-data-[desc]/head:flex"></i>
						</div>
					);
				})}
			</div>
		</>
	);
}
