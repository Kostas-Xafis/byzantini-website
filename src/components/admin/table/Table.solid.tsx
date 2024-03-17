import type { Accessor, JSX } from "solid-js";
import { For, Show, createMemo, createSignal } from "solid-js";
import { TypeEffectEnum, selectedRowsEvent } from "../../../../lib/hooks/useSelectedRows.solid";
import { getParent, mappedValue } from "../../../../lib/utils.client";
import Row, { toggleCheckbox, toggleCheckboxes, type CellValue } from "./Row.solid";
export type Props = {
	columns: Record<string, { type: CellValue; name: string; size?: number }>; // The column names and types
	data: Accessor<any[]>; // The data to be displayed
	prefix?: string; // Prefix for the data- attribute on the table
	children?: JSX.Element | JSX.Element[];
	hasSelectBox?: boolean; // Whether to show the checkbox on the left of each row
	paginate?: number; // Number of items per page
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
	const { columns: columnNames, prefix = "", data, paginate } = props;
	const [pagination, setPagination] =
		(paginate && createSignal({ page: 0, size: paginate }, { equals: false })) || [];
	//@ts-ignore
	const maxPage = createMemo(() =>
		Math.ceil(data().length / ((pagination && pagination().size) || data().length))
	);

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
		if (!pagination) return data;
		const { page, size } = pagination();
		if (data.length < page * size) {
			//This happens during a user search
			const newPage = Math.floor(data.length / size);
			setPagination && setPagination((prev) => ({ ...prev, page: newPage }));
			return data.slice(0, size);
		}
		let res = data.slice(
			page * size,
			mappedValue((page + 1) * size, 0, data.length, 0, data.length)
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
			if (paginate) {
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

	const onClickPagination = (e: MouseEvent) => {
		const btn = getParent(e.target as HTMLElement, "button");
		if (!btn || btn.dataset.active === "false") {
			return;
		}
		const pageTurn = Number(btn.dataset["pageturn"]);
		if (pageTurn === 0) {
			return;
		}
		setPagination &&
			setPagination((prev) => {
				const page = prev.page + pageTurn;
				return { ...prev, page };
			});
		document.dispatchEvent(new CustomEvent("hydrate"));
	};

	return (
		<div
			class={
				"h-[100dvh] pt-[1.5vh] grid grid-cols-[100%] justify-center content-start items-start gap-y-3 z-[1]" +
				" max-sm:h-max max-sm:mt-0 max-sm:w-[100dvw] max-sm:py-4" +
				((paginate && " grid-rows-[max-content,1fr,max-content]") ||
					" grid-rows-[max-content,1fr]")
			}
			data-prefix={prefix}>
			<div class="flex flex-row flex-wrap max-sm:gap-y-4 w-full justify-evenly z-[1001]">
				{props.children}
			</div>
			<div
				id="tableContainer"
				style={{ "--paginate": paginate ? "1" : "0" }}
				class="relative z-[1000] min-w-[40%] max-w-[90%] max-sm:max-w-[92.5%] overflow-x-auto justify-self-center col-span-full grid auto-rows-[auto_1fr] grid-flow-row shadow-md shadow-gray-400 rounded-lg font-didact border-2 border-red-900"
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
			<Show when={paginate && paginate < props.data().length}>
				<div
					class="w-full pb-4 flex flex-row justify-center gap-x-2 font-didact text-2xl text-red-950"
					onClick={onClickPagination}>
					<button
						// @ts-ignore
						data-active={pagination().page - 1 >= 0}
						class="group/pgBtn transition-all rounded px-2 data-[active=true]:hover:shadow-md data-[active=true]:hover:shadow-gray-400 data-[active=true]:hover:bg-red-950 data-[active=true]:hover:text-white"
						data-pageTurn="-1"
						type="button">
						<i class="text-xl py-[2px] fa-solid fa-arrow-left group-data-[active=false]/pgBtn:text-gray-300"></i>
					</button>
					{/* @ts-ignore */}
					{maxPage() > 1 && pagination().page - 1 >= 0 && (
						<button
							class="transition-all rounded px-2 hover:shadow-md hover:shadow-gray-400 hover:bg-red-950 hover:text-white"
							data-pageTurn="-1"
							type="button">
							{/* @ts-ignore */}
							{pagination().page}
						</button>
					)}
					<button
						class="relative transition-all rounded px-2 hover:shadow-md hover:shadow-gray-400 hover:bg-red-950 hover:text-white hover:before:hidden before:absolute before:bottom-0 before:inset-x-0 before:h-[1px] before:bg-red-950 before:z-[10]"
						data-pageTurn="0"
						type="button">
						{/* @ts-ignore */}
						{pagination().page + 1}
					</button>
					{
						//@ts-ignore
						maxPage() > 2 && pagination().page + 1 < maxPage() && (
							<button
								class="transition-all rounded px-2 hover:shadow-md hover:shadow-gray-400 hover:bg-red-950 hover:text-white"
								data-pageTurn="1"
								type="button">
								{/* @ts-ignore */}
								{pagination().page + 2}
							</button>
						)
					}
					{/* @ts-ignore */}
					{pagination().page !== maxPage() && (
						<button
							// @ts-ignore
							data-active={pagination().page + 1 < maxPage()}
							class="group/pgBtn transition-all rounded px-2 data-[active=true]:hover:shadow-md data-[active=true]:hover:shadow-gray-400 data-[active=true]:hover:bg-red-950 data-[active=true]:hover:text-white"
							data-pageTurn="1"
							type="button">
							<i class="text-xl py-[2px] fa-solid fa-arrow-right group-data-[active=false]/pgBtn:text-gray-300"></i>
						</button>
					)}
				</div>
			</Show>
			<style>
				{`
	@media (min-height: 860px) {
		#tableContainer {
			max-height: calc(var(--paginate) * 85vh + (1 - var(--paginate)) * 88.5vh);
		}
	}
	@media (max-height: 859px) {
		#tableContainer {
			max-height: calc(var(--paginate) * 82vh + (1 - var(--paginate)) * 88.5vh);
		}
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
