import Row from "./Row.solid";
import { For, createMemo, createSignal } from "solid-js";
import type { Accessor, JSX } from "solid-js";
export type Props = {
	columnNames: Record<string, string | { name: string; size: () => number }>;
	data: Accessor<any[]>;
	prefix?: string;
	children?: JSX.Element | JSX.Element[];
};

export const enum SortDirection {
	ASCENDING,
	DESCENDING,
	NONE
}

export default function Table(props: Props) {
	const [sorted, setSorted] = createSignal<[SortDirection, number]>([SortDirection.NONE, -1], { equals: false });
	const { columnNames, prefix = "", data } = props;

	const readRowData = createMemo(() => {
		const rows = data().slice();
		const [direction, column_index] = sorted();
		if (direction === SortDirection.NONE || column_index < 0) return rows.sort((a, b) => a[0] - b[0]);
		rows.sort((a, b) => {
			if (a[column_index] === b[column_index]) return 0;
			if (typeof a[column_index] === "string" && typeof b[column_index] === "string") {
				if (a[column_index] === "" || !a[column_index]) return 1;
				if (b[column_index] === "" || !b[column_index]) return -1;
				return a[column_index].localeCompare(b[column_index]);
			}
			if (typeof a[column_index] === "number" && typeof b[column_index] === "number") {
				if (a[column_index] <= 0) return 1;
				if (b[column_index] <= 0) return -1;
				return a[column_index] - b[column_index];
			}
			return 0;
		});
		return direction === SortDirection.ASCENDING ? rows : rows.reverse();
	});

	let columnWidths = "grid-template-columns: ";
	const columns = [] as string[];
	Object.values(columnNames).forEach(str => {
		if (typeof str === "object") {
			columnWidths += `calc(${str.size()}ch + 2ch)`;
			columns.push(str.name);
		} else {
			columnWidths += `calc(${str.length}ch + 2ch)`;
			columns.push(str);
		}
	});
	columnWidths += ";";
	return (
		<div
			class={
				"w-[100%] h-[97.5vh] mt-[2.5vh] grid grid-rows[auto_1fr] justify-between" +
				(["books", "teachers"].includes(prefix) && " grid-cols-2")
			}
			data-prefix={prefix}
		>
			{props.children}
			<div
				id="tableContainer"
				class="relative z-[1000] min-w-[40%] max-w-[80%] overflow-x-auto h-min justify-self-center col-span-full grid auto-rows-[auto_1fr] grid-flow-row shadow-md shadow-gray-400 rounded-lg font-didact"
			>
				<Row data={columns} columnWidths={columnWidths} rows={data.length} header sortOnClick={setSorted} />
				<div class="data-container relative z-0 max-h-[calc(85vh_-_3.75rem)] grid auto-rows-auto overflow-y-auto overflow-x-hidden grid-flow-row rounded-b-lg">
					<For each={readRowData()}>
						{(item, index) => {
							return <Row data={item} index={index()} columnWidths={columnWidths} rows={data.length} />;
						}}
					</For>
				</div>
			</div>
			<style>
				{`
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
