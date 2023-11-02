import Row, { type CellValue } from "./Row.solid";
import { For, createMemo, createSignal, useContext } from "solid-js";
import type { Accessor, JSX } from "solid-js";
import {
	SelectedItemsContext,
	type ContextType,
} from "./SelectedRowContext.solid";
import { getParent } from "../../../../lib/utils.client";
export type Props = {
	columns: Record<string, { type: CellValue; name: string; size?: number }>;
	data: Accessor<any[]>;
	prefix?: string;
	children?: JSX.Element | JSX.Element[];
	hasSelectBox?: boolean;
};

export const enum SortDirection {
	ASCENDING,
	DESCENDING,
	NONE,
}

export type ColumnType<T> = Record<
	keyof T,
	{ type: CellValue; name: string; size?: number }
>;

// Horizontal Scrolling for table from https://codepen.io/toddwebdev/pen/yExKoj
let isDown = false;
let startX: number, scrollLeft: number;
const startDragging = (e: MouseEvent) => {
	isDown = true;
	(e.currentTarget as HTMLElement).classList.add("active");
	startX = e.pageX - (e.currentTarget as HTMLElement).offsetLeft;
	scrollLeft = (e.currentTarget as HTMLElement).scrollLeft;
};
const stopDragging = (e: MouseEvent) => {
	isDown = false;
	(e.currentTarget as HTMLElement).classList.remove("active");
};
const move = (e: MouseEvent) => {
	if (!isDown) return;
	e.preventDefault();
	const x = e.pageX - (e.currentTarget as HTMLElement).offsetLeft;
	const walk = (x - startX) * 4; //scroll-fast
	(e.currentTarget as HTMLElement).scrollLeft = scrollLeft - walk;
};

// const getChunkPosition = (arrSize: number): [number, number] => {
// 	// This will load chunkSize * 3 items at a time

// 	// No need to chunk if there are less than 50 items
// 	if (arrSize < 50) return [0, arrSize];
// 	const table = document.querySelector(
// 		"#tableContainer .data-container"
// 	) as HTMLElement;

// 	const chunkSize = 50;
// 	const totalChunks = Math.ceil(arrSize / chunkSize);

// 	const tableHeight = table.scrollHeight;
// 	const chunkHeight = tableHeight / totalChunks;

// 	const tableTopPosition = table.scrollTop;
// 	const chunkIndex = Math.floor(tableTopPosition / chunkHeight) + 1;

// 	if (tableTopPosition % chunkHeight < chunkHeight * 0.25 && chunkIndex > 1) {
// 		return [(chunkIndex - 1) * chunkSize, chunkIndex * chunkSize].map((n) =>
// 			Math.min(n, arrSize)
// 		) as [number, number];
// 	} else if (tableTopPosition % chunkHeight > chunkHeight * 0.75) {
// 		return [chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize].map((n) =>
// 			Math.min(n, arrSize)
// 		) as [number, number];
// 	}
// 	// return
// };

export default function Table(props: Props) {
	const [selectedItems, { add, addMany, remove, removeAll }] = useContext(
		SelectedItemsContext
	) as ContextType;

	const [sorted, setSorted] = createSignal<[SortDirection, number]>(
		[SortDirection.NONE, -1],
		{ equals: false }
	);
	const { columns: columnNames, prefix = "", data } = props;

	const columnTypes = Object.values(columnNames).map(({ type }) => type);
	const readRowData = createMemo(() => {
		const [direction, column_index] = sorted();
		if (direction === SortDirection.NONE || column_index < 0) {
			return data();
		}

		const rows = data().slice(); // Remove any solid-js proxies

		let columnType = columnTypes[column_index];
		let revOrder = direction === SortDirection.DESCENDING ? -1 : 1;
		if (
			columnType === "date" ||
			columnType === "number" ||
			columnType === "boolean"
		) {
			rows.sort((a, b) => {
				if (a[column_index] === undefined || a[column_index] === null)
					return -1 * revOrder;
				else if (
					b[column_index] === undefined ||
					b[column_index] === null
				)
					return 1 * revOrder;
				return (a[column_index] - b[column_index]) * revOrder;
			});
		} else if (columnType === "link" || columnType === "string") {
			rows.sort((a, b) => {
				if (a[column_index] === "" || !a[column_index])
					return 1 * revOrder;
				else if (b[column_index] === "" || !b[column_index])
					return -1 * revOrder;
				return (
					a[column_index].localeCompare(b[column_index]) * revOrder
				);
			});
		}
		return rows;
	});

	let columnWidths =
		"grid-template-columns: " + (props.hasSelectBox ? "2ch " : "");
	const columns = Object.values(columnNames).map(({ name, size }) => {
		let len = size || name.length;
		columnWidths += `calc(${len}ch + 2ch)`;
		return name;
	});
	columnWidths += ";";
	if (props.hasSelectBox) columnWidths += "padding-left: 1.5rem;";

	const onClick = (e: MouseEvent) => {
		const row = getParent(e.target as HTMLElement, ".row");
		if (!row) return;

		// const removedAllAction = false;
		if (row.classList.contains("header")) {
			const hasSelection = selectedItems.length > 0;
			if (hasSelection) {
				removeAll && removeAll();
			} else {
				const ids = data().map((el) => Number(el[0]));
				addMany && addMany(ids);
			}
			if (props.hasSelectBox)
				document
					.querySelectorAll(`.cb`)
					.forEach((cb) =>
						cb.classList.toggle("selected", !hasSelection)
					);
		} else {
			const item_id = Number(row.dataset.id as string);
			const isSelected = selectedItems.includes(item_id);

			if (isSelected) remove && remove(item_id);
			else add && add(item_id);
			row.classList.toggle("selectedRow");

			if (props.hasSelectBox)
				document
					.querySelector(`.cb[data-value="${item_id}"]`)
					?.classList.toggle("selected");
		}
	};

	return (
		<div
			class={
				"w-[calc(90dvw_-_80px)] h-[95vh] mt-[2.5vh] grid grid-cols-[100%] justify-center content-start items-center gap-y-4 z-[1]" +
				" max-sm:h-max max-sm:mt-0 max-sm:w-[100dvw] max-sm:py-4"
			}
			data-prefix={prefix}
		>
			<div class="flex flex-row flex-wrap max-sm:gap-y-4 w-full justify-evenly z-[1001]">
				{props.children}
			</div>
			<div
				id="tableContainer"
				class="relative z-[1000] min-w-[40%] max-w-[80%] max-sm:max-w-[92.5%] overflow-x-auto h-min justify-self-center col-span-full grid auto-rows-[auto_1fr] grid-flow-row shadow-md shadow-gray-400 rounded-lg font-didact border-2 border-red-900"
				onMouseMove={move}
				onMouseDown={startDragging}
				onMouseUp={stopDragging}
				onMouseLeave={stopDragging}
				onClick={onClick}
			>
				<Row
					data={columns}
					columnType={columnTypes}
					header
					sortOnClick={setSorted}
					hasSelectBox={!!props.hasSelectBox}
				/>
				<div class="data-container relative -z-10 max-h-[calc(82.5vh_-_3.75rem)] grid auto-rows-auto overflow-y-auto overflow-x-hidden grid-flow-row rounded-b-lg">
					<For each={readRowData()}>
						{(item, index) => {
							return (
								<Row
									data={item}
									index={index()}
									columnType={columnTypes}
									hasSelectBox={!!props.hasSelectBox}
								/>
							);
						}}
					</For>
				</div>
			</div>
			<style>
				{`
	.row {
		${columnWidths}
	}
	.row:is(.selectedRow):nth-child(odd)::before,
	.row:is(.selectedRow)::before {
		background-color: rgb(254,202,202);
	}
	.row:is(.selectedRow):hover {
		--tw-shadow-color: #1f2937 !important;
	}
	@keyframes ShakeAnimation {
		0% {
			transform: translateX(0);
			filter: blur(0px);
		}
		10%,
		30%,
		70%,
		90% {
			transform: translateX(1px);
		}
		20%,
		40%,
		60%,
		80% {
			transform: translateX(-1px);
		}
		50% {
			transform: translateX(1px);
			filter: blur(1px);
		}
		100% {
			transform: translateX(0px);
			filter: blur(0px);
		}
	}

	.animate-shake button[type='submit'] {
		animation: ShakeAnimation 0.5s ease-in-out;
	}`}
			</style>
		</div>
	);
}
