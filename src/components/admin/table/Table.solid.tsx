import type { Accessor, JSX } from "solid-js";
import { For, createMemo, createSignal, onCleanup, onMount, untrack } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { TypeEffectEnum, selectedRowsEvent } from "../../../../lib/hooks/useSelectedRows.solid";
import { getParent, mappedValue } from "../../../../lib/utils.client";
import type { Page } from "./Pagination.solid";
import Row, { toggleCheckbox, toggleCheckboxes, type CellValue } from "./Row.solid";

type DOMElement = Element | JSX.Element;

export type Props = {
	columns: Record<string, { type: CellValue; name: string; size?: number }>; // The column names and types
	data: Accessor<any[]>; // The data to be displayed
	prefix?: string; // Prefix for the data- attribute on the table
	children?: DOMElement | DOMElement[];
	hasSelectBox?: boolean; // Whether to show the checkbox on the left of each row
	pageSize?: number; // Number of items per page
	tools?: {
		top: boolean;
		left: boolean;
		bottom: boolean;
	};
};

export const enum SortDirection {
	ASCENDING,
	DESCENDING,
	NONE,
}

export type ColumnType<T> = Record<keyof T, { type: CellValue; name: string; size?: number }>;

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

const computeColumns = (
	columnNames: Record<string, { type: CellValue; name: string; size?: number }>,
	hasSelectBox: boolean
) => {
	let columnWidths = "grid-template-columns: " + (hasSelectBox ? "5ch " : "");
	const columns = Object.values(columnNames).map(({ name, size }) => {
		let len = (size || name.length) + 1;
		columnWidths += ` ${len + 2}ch`;
		return name;
	});
	columnWidths += ";";
	// if (hasSelectBox) columnWidths += "padding-left: 1.5rem;";
	return { columnWidths, columns };
};

export default function Table(props: Props) {
	const [sorted, setSorted] = createSignal<[SortDirection, number]>([SortDirection.NONE, -1], {
		equals: false,
	});
	const {
		columns: columnNames,
		prefix = "",
		data,
		pageSize = 100,
		tools = { top: true, left: false, bottom: false },
	} = props;
	const [tablePagination, setTablePagination] = createStore<Page>({
		page: 0,
		pageSize,
		dataSize: data().length,
	});
	const columnTypes = Object.values(columnNames).map(({ type }) => type);
	const readRowData = () => {
		const [direction, col_ind] = sorted();
		if (direction === SortDirection.NONE || col_ind < 0) {
			return data();
		}

		const rows = data().slice(); // Remove any solid-js proxies

		let columnType = columnTypes[col_ind];
		let revOrder = direction === SortDirection.DESCENDING ? -1 : 1;

		// By not applying the revOrder to the undefined/null values, they will always be at the end of the list
		if (columnType === "date" || columnType === "number" || columnType === "boolean") {
			rows.sort((a, b) => {
				if (a[col_ind] === undefined || a[col_ind] === null) return 1;
				if (b[col_ind] === undefined || b[col_ind] === null) return -1;
				return (a[col_ind] - b[col_ind]) * revOrder;
			});
		} else if (columnType === "link" || columnType === "string") {
			rows.sort((a, b) => {
				if (a[col_ind] === "" || !a[col_ind]) return 1;
				if (b[col_ind] === "" || !b[col_ind]) return -1;
				return a[col_ind].localeCompare(b[col_ind]) * revOrder;
			});
		}
		return rows;
	};
	const readPageData = createMemo(() => {
		const data = readRowData();
		const dataLength = data.length;
		const { pageSize, dataSize } = unwrap(tablePagination);
		const page = tablePagination.page;
		if (dataLength !== dataSize) {
			untrack(() => setTablePagination((prev) => ({ ...prev, dataSize: dataLength })));
			return data.slice(0, pageSize);
		}
		let res = data.slice(
			page * pageSize,
			mappedValue((page + 1) * pageSize, 0, dataLength, 0, dataLength)
		);
		// In case of table sorting with pagination, the payment status of each row must be updated
		setTimeout(() => document.dispatchEvent(new CustomEvent("hydrate")), 0);
		return res;
	});

	const { columnWidths, columns } = computeColumns(columnNames, !!props.hasSelectBox);
	const onClickRow = (e: MouseEvent) => {
		if (isDown) return;
		const row = getParent(e.target as HTMLElement, ".row");
		if (!row) return;

		if (row.classList.contains("header")) {
			// If user actually clicked on the main checkbox
			let mainCheckbox = getParent(e.target as HTMLElement, ".mcb");
			if (!mainCheckbox) return;
			toggleCheckboxes();
			if (tools.bottom) {
				let tableHasSelected = document.querySelector(".selectedRow") !== null;
				if (tableHasSelected) {
					const ids = data().map((row) => row[0]) as number[];
					selectedRowsEvent({ type: TypeEffectEnum.ADD_MANY, ids });
				}
			}
		} else {
			const item_id = Number(row.dataset.id as string);
			toggleCheckbox(item_id);
		}
	};

	function tablePaginationListener(e: CustomEvent<Page>) {
		const { page, pageSize, dataSize } = e.detail;
		setTablePagination((prev) => ({ page, pageSize, dataSize }));
	}

	onMount(() => {
		document.addEventListener("onTablePageChange", tablePaginationListener);
	});

	onCleanup(() => {
		document.removeEventListener("onTablePageChange", tablePaginationListener);
	});

	return (
		<div
			id="table"
			class={
				"h-[100dvh] pt-[1.5vh] justify-center content-start items-start gap-y-3 z-[1]" +
				" max-sm:h-max max-sm:mt-0 max-sm:w-[100dvw] max-sm:py-4 dark:bg-dark" +
				((tools.bottom && " grid-rows-[max-content,1fr,max-content]") ||
					" grid-rows-[max-content,1fr]") +
				(tools.left ? " pr-8" : "")
			}
			data-prefix={prefix}>
			{props.children}
			<div
				id="tableContainer"
				style={{ "--tools_bottom": tools.bottom ? "1" : "0", "grid-area": "table" }}
				class={
					"relative z-[1000] min-w-[40%] overflow-x-auto justify-self-center col-span-full grid auto-rows-[auto_1fr] grid-flow-row shadow-md shadow-gray-400 rounded-lg font-didact border-2 border-red-900" +
					(tools.left
						? " max-w-[100%] max-sm:max-w-[97.5%]"
						: " max-w-[90%] max-sm:max-w-[92.5%]")
				}
				onMouseMove={move}
				onMouseDown={startDragging}
				onMouseUp={stopDragging}
				onMouseLeave={stopDragging}
				onClick={onClickRow}>
				<Row
					data={columns}
					columnTypes={columnTypes}
					header
					sortOnClick={setSorted}
					hasSelectBox={!!props.hasSelectBox}
				/>
				<div class="data-container relative -z-10 grid auto-rows-auto overflow-y-auto overflow-x-hidden grid-flow-row rounded-b-lg">
					<For each={readPageData()}>
						{(item) => {
							return (
								<Row
									data={item}
									columnTypes={columnTypes}
									hasSelectBox={!!props.hasSelectBox}
								/>
							);
						}}
					</For>
				</div>
			</div>
			<style>
				{`
	@media (min-height: 860px) {
		#tableContainer {
			max-height: calc(var(--tools_bottom) * 85vh + (1 - var(--tools_bottom)) * 88.5vh);
		}
	}
	@media (max-height: 859px) {
		#tableContainer {
			max-height: calc(var(--tools_bottom) * 82vh + (1 - var(--tools_bottom)) * 88.5vh);
		}
	}

	#table {
		display:grid;
		grid-template-columns: ${tools.left ? "minmax(min-content, calc(4rem + 7ch)) auto" : "100%"};
		grid-template-areas:
			"top_tools top_tools"
			${tools.left ? '"left_tools table"' : '"table table"'}
			${
				tools.left && tools.bottom
					? '"left_tools bottom_tools"'
					: tools.bottom
					? '"bottom_tools bottom_tools"'
					: ""
			};

	}

	.row {
		${columnWidths}
		position: relative;
		display: grid;
		grid-auto-flow: column;
		justify-content: space-between;
		place-items: center;
		height: min-content;
   		padding-right: 1.5rem/* 24px */;
		column-gap: 0.5rem/* 8px */;
		font-size: 1.125rem/* 18px */;
		text-align: center;
		background-color: transparent;
		transition: box-shadow 0.2s cubic-bezier(0,.8,.43,.64);
	}
	/* shorthand for this:
		relative grid grid-flow-col justify-between justify-items-center items-center h-min px-6 gap-x-2 text-center text-lg max-sm:text-sm bg-transparent hover:shadow-md hover:shadow-gray-400 before:content-[''] before:absolute before:inset-0 before:-z-10 odd:before:bg-gray-100
	*/
	.row::before {
		content: "";
		position: absolute;
		inset: 0;
		z-index: -10;
	}
	.row:hover {
		--tw-shadow-color: #9ca3af;
		--tw-shadow-colored: 0 4px 6px -1px var(--tw-shadow-color), 0 2px 4px -2px var(--tw-shadow-color);
		--tw-shadow-colored-top: 0 -2px 3px 0px var(--tw-shadow-color);
    	--tw-shadow: var(--tw-shadow-colored);

		box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow), var(--tw-shadow-colored-top);
	}
	.row:nth-child(odd)::before {
		background-color: rgb(243,244,246);
	}
	.row:nth-child(even)::before {
		background-color: white;
	}

	.row:is(.selectedRow):nth-child(odd)::before,
	.row:is(.selectedRow)::before {
		background-color: rgb(254,202,202);
	}
	.row:is(.selectedRow):hover {
		--tw-shadow-color: #6b7280 !important;
	}
	.cell {
		position: relative;
		width: 100%;
		min-width: 0;
		word-break: break-word;
		padding-top: 0.25rem/* 4px */;
		padding-bottom: 0.25rem/* 4px */;
	}
	.selectBox {
		position: absolute;
		top: 50%;
		left: 0;
		transform: translate(-50%, -50%);
		color: rgb(55 65 81);
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
