import Row, {
	toggleCheckboxes,
	type CellValue,
	toggleCheckbox,
} from "./Row.solid";
import { For, createMemo, createSignal } from "solid-js";
import type { Accessor, JSX } from "solid-js";
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

export default function Table(props: Props) {
	const [sorted, setSorted] = createSignal<[SortDirection, number]>(
		[SortDirection.NONE, -1],
		{ equals: false }
	);
	const { columns: columnNames, prefix = "", data } = props;

	const columnTypes = Object.values(columnNames).map(({ type }) => type);
	const readRowData = createMemo(() => {
		const [direction, col_ind] = sorted();
		if (direction === SortDirection.NONE || col_ind < 0) {
			return data();
		}

		const rows = data().slice(); // Remove any solid-js proxies

		let columnType = columnTypes[col_ind];
		let revOrder = direction === SortDirection.DESCENDING ? -1 : 1;

		// By not applying the revOrder to the undefined/null values, they will always be at the end of the list
		if (
			columnType === "date" ||
			columnType === "number" ||
			columnType === "boolean"
		) {
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
	});

	let columnWidths =
		"grid-template-columns: " + (props.hasSelectBox ? "2ch " : "");
	const columns = Object.values(columnNames).map(({ name, size }) => {
		let len = size || name.length;
		columnWidths += ` calc(${len}ch + 2ch)`;
		return name;
	});
	columnWidths += ";";
	if (props.hasSelectBox) columnWidths += "padding-left: 1.5rem;";

	const onClick = (e: MouseEvent) => {
		const row = getParent(e.target as HTMLElement, ".row");
		if (!row) return;

		// const removedAllAction = false;
		if (row.classList.contains("header")) {
			const mainCheckbox = getParent(e.target as HTMLElement, ".mcb");
			if (!mainCheckbox) return;
			toggleCheckboxes();
		} else {
			const item_id = Number(row.dataset.id as string);
			toggleCheckbox(item_id);
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
					columnTypes={columnTypes}
					header
					sortOnClick={setSorted}
					hasSelectBox={!!props.hasSelectBox}
				/>
				<div class="data-container relative -z-10 max-h-[calc(82.5vh_-_3.75rem)] grid auto-rows-auto overflow-y-auto overflow-x-hidden grid-flow-row rounded-b-lg">
					<For each={readRowData()}>
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
	.row {
		${columnWidths}
		position: relative;
		display: grid;
		grid-auto-flow: column;
		justify-content: space-between;
		place-items: center;
		height: min-content;
		padding-left: 2rem/* 32px */;
   		padding-right: 2rem/* 32px */;
		column-gap: 0.5rem/* 8px */;
		font-size: 1.125rem/* 18px */;
   		line-height: 1.75rem/* 28px */;
		text-align: center;
		background-color: transparent;
	}
	/* shorthand for this:
		relative grid grid-flow-col justify-between justify-items-center items-center h-min px-8 gap-x-2 text-center text-lg max-sm:text-sm bg-transparent hover:shadow-md hover:shadow-gray-400 before:content-[''] before:absolute before:inset-0 before:-z-10 odd:before:bg-gray-100
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
    	--tw-shadow: var(--tw-shadow-colored);

		box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow);
	}
	.row:nth-child(odd)::before {
		background-color: rgb(243,244,246);
	}

	.row:is(.selectedRow):nth-child(odd)::before,
	.row:is(.selectedRow)::before {
		background-color: rgb(254,202,202);
	}
	.row:is(.selectedRow):hover {
		--tw-shadow-color: #1f2937 !important;
	}
	.cell {
		position: relative;
		width: 100%;
		padding-top: 0.5rem/* 8px */;
		padding-bottom: 0.5rem/* 8px */;
	}
	.selectBox {
		position: absolute;
		top: 50%;
		left: 0;
		width: 16px;
		transform: translateY(-50%);
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
