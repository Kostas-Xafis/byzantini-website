import { Setter, onMount, useContext } from "solid-js";
import { ContextType, SelectedItemsContext } from "./SelectedRowContext.solid";
import { SortDirection } from "./Table.solid";

interface Props {
	data: (number | string)[]; // data[0] must always be the id of the item
	columnWidths: string;
	rows: number;
	index?: number;
	header?: boolean;
	sortOnClick?: Setter<[SortDirection, number]>;
}

export default function Row(props: Props) {
	const [selectedItems, { add, remove }] = useContext(SelectedItemsContext) as ContextType;
	const { data, columnWidths, index = -1, rows, header, sortOnClick } = props;

	const onClick = !header
		? (e: MouseEvent) => {
				const i = Number((e.currentTarget as HTMLElement).dataset.id as string);
				const isSelected = selectedItems.includes(i);
				if (isSelected) remove(i);
				else add(i);
				(e.currentTarget as HTMLElement).classList.toggle("selectedRow");
		  }
		: undefined;
	const openToNewTab = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const url = (e.currentTarget as HTMLAnchorElement).href;
		window.open(url, "_blank");
	};
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
		onMount(async () => {
			const container = document.querySelector(".data-container") as HTMLElement;
			if (container.scrollHeight > container.clientHeight) {
				document
					.querySelector(".header")
					//@ts-ignore
					?.style.setProperty("grid-template-columns", columnWidths.split(":")[1].slice(0, -2) + " 1ch");
			}
		});
	}
	return (
		<>
			<div
				onClick={onClick}
				data-id={data[0]}
				data-index={index}
				class={
					"row relative grid grid-flow-col justify-between justify-items-center items-center h-min px-8 gap-x-2 text-center text-lg bg-transparent" +
					" hover:shadow-md hover:shadow-gray-400 before:content-[''] before:absolute before:inset-0 before:-z-10 odd:before:bg-gray-100" +
					(props?.header
						? " header absolute top-0 left-0 right-0 shadow-md shadow-gray-500 rounded-t-xl before:content-[none] hover:shadow-gray-500"
						: "")
				}
				style={columnWidths + ` z-index: ${(rows - index) * 10}`}
			>
				{data.map((item, colIndex) => {
					const isLink = typeof item === "string" && (item.startsWith("/") || item.startsWith("https"));
					if (isLink)
						return (
							<a
								href={item}
								onClick={openToNewTab}
								class="grid grid-cols-[auto_auto] place-items-center underline underline-offset-1"
							>
								<div>Προβολή</div>
								<i class="fa-solid fa-up-right-from-square"></i>
							</a>
						);
					return (
						<div
							class={
								"relative w-full data-[asc]:bg-red-900 data-[asc]:text-white data-[desc]:bg-red-900 data-[desc]:text-white py-2 " +
								(header ? " group/head" : "")
							}
							data-col-ind={colIndex}
							onClick={onClickSort}
						>
							{typeof item === "number" && item <= 0 ? "-" : item}
							<i class="absolute text-sm right-0 top-[50%] translate-x-[-50%] translate-y-[-50%] fa-solid fa-chevron-up hidden group-data-[asc]/head:flex"></i>
							<i class="absolute text-sm right-0 top-[50%] translate-x-[-50%] translate-y-[-50%] fa-solid fa-chevron-down hidden group-data-[desc]/head:flex"></i>
						</div>
					);
				})}
			</div>
		</>
	);
}
