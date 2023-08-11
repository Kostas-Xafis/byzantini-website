import Row from "./Row.solid";
import { Accessor, For, JSX } from "solid-js";
export type Props = {
	columnNames: Record<string, string | { name: string; size: () => number }>;
	data: Accessor<any[]>;
	prefix: string;
	children?: JSX.Element | JSX.Element[];
};

export default function Table(props: Props) {
	const { columnNames, prefix, data } = props;

	let columnWidths = "grid-template-columns: ";
	const columns = [] as string[];
	Object.values(columnNames).forEach(str => {
		if (typeof str === "object") {
			columnWidths += str.size() + "ch ";
			columns.push(str.name);
		} else {
			columnWidths += str.length + 2 + "ch ";
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
				class="relative z-[1000] min-w-[40%] max-w-[80%] overflow-auto h-min justify-self-center col-span-full grid auto-rows-[auto_1fr] grid-flow-row shadow-md shadow-gray-400 rounded-lg font-didact"
			>
				<Row data={columns} columnWidths={columnWidths} rows={data.length} header />
				<div class="data-container relative z-0 max-h-[calc(85vh_-_3.75rem)] grid auto-rows-auto auto grid-flow-row rounded-b-lg overflow-y-auto">
					<For each={data()}>
						{(item, index) => {
							return <Row data={item} index={index()} columnWidths={columnWidths} rows={data.length} />;
						}}
					</For>
				</div>
			</div>
			<style>
				{`.row:is(.selectedRow):nth-child(odd)::before,
	.row:is(.selectedRow)::before {
		background-color: #50ef80;
	}
	.row:is(.selectedRow):hover {
		--tw-shadow-color: #1f2937 !important;
	}`}
			</style>
			<style>
				{`
	@import url("https://fonts.googleapis.com/css2?family=Didact+Gothic&display=swap");
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

	.animate-shake button {
		animation: ShakeAnimation 0.6s ease-in-out;
	}`}
			</style>
		</div>
	);
}
