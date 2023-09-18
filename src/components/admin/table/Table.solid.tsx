import Row, { type CellValue } from "./Row.solid";
import { For, createMemo, createSignal } from "solid-js";
import type { Accessor, JSX } from "solid-js";
export type Props = {
	columns: Record<
		string,
		{ type: CellValue; name: string; size?: () => number }
	>;
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
	{ type: CellValue; name: string; size?: () => number }
>;

export default function Table(props: Props) {
	const [sorted, setSorted] = createSignal<[SortDirection, number]>(
		[SortDirection.NONE, -1],
		{ equals: false }
	);
	const { columns: columnNames, prefix = "", data } = props;

	const columnTypes = Object.values(columnNames).map(({ type }) => type);
	const readRowData = createMemo(() => {
		const rows = data().slice(); // Remove any solid-js proxies
		const [direction, column_index] = sorted();
		if (direction === SortDirection.NONE || column_index < 0) return rows;

		let columnType = columnTypes[column_index];
		if (columnType === "date" || columnType === "number") {
			rows.sort((a, b) => a[column_index] - b[column_index]);
		} else {
			rows.sort((a, b) => {
				if (a[column_index] === "" || !a[column_index]) return 1;
				if (b[column_index] === "" || !b[column_index]) return -1;
				return a[column_index].localeCompare(b[column_index]);
			});
		}
		return direction === SortDirection.ASCENDING ? rows : rows.reverse();
	});

	let columnWidths =
		"grid-template-columns: " + (props.hasSelectBox ? "2ch " : "");
	const columns = Object.values(columnNames).map(({ name, size }) => {
		let len = (size && size()) || name.length;
		columnWidths += `calc(${len}ch + 2ch)`;
		return name;
	});
	columnWidths += ";";
	return (
		<div
			class="w-[calc(90dvw_-_80px)] h-[95vh] mt-[2.5vh] grid grid-cols-[100%] justify-center content-start items-center gap-y-4"
			data-prefix={prefix}
		>
			<div class="flex flex-row w-full justify-evenly z-[1001]">
				{props.children}
			</div>
			<div
				id="tableContainer"
				class="relative z-[1000] min-w-[40%] max-w-[80%] overflow-x-auto h-min justify-self-center col-span-full grid auto-rows-[auto_1fr] grid-flow-row shadow-md shadow-gray-400 rounded-lg font-didact"
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
