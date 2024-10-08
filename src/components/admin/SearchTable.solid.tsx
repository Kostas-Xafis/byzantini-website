import { batch, createSignal, Index } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import { UpdateHandler } from "../../../lib/utils.client";
import type { CellValue } from "./table/Row.solid";

export const enum Compare {
	Eq = "=",
	Ne = "!=",
	Gt = ">",
	Lt = "<",
	Gte = ">=",
	Lte = "<=",
}

export const getCompareFn = (value: string) => {
	const EqCheck = CompareList.findLast((c) => value.startsWith(c));
	switch (EqCheck) {
		case Compare.Gte:
			return (nCol: number, nVal: number) => nCol >= nVal;
		case Compare.Lte:
			return (nCol: number, nVal: number) => nCol <= nVal;
		case Compare.Gt:
			return (nCol: number, nVal: number) => nCol > nVal;
		case Compare.Lt:
			return (nCol: number, nVal: number) => nCol < nVal;
		case Compare.Eq:
			return (nCol: number, nVal: number) => nCol === nVal;
		// default:
		// 	return (nCol: number, nVal: number) => nCol === nVal;
	}
};

// Since findLast is used to find the last occurence of the operator, the order of the array is important
export const CompareList = [
	Compare.Eq,
	Compare.Ne,
	Compare.Gt,
	Compare.Lt,
	Compare.Gte,
	Compare.Lte,
];

export type SearchColumn = {
	columnName: string;
	name: string;
	type: CellValue;
};
export type SearchSetter<T extends Record<string, any>> = Partial<{
	columnName: keyof T;
	value: string;
	type: CellValue;
}>;
type SearchTableProps<T extends Record<string, any>> = {
	setSearchQuery: SetStoreFunction<SearchSetter<T>>; // returns the ids of the searched result rows
	columns: SearchColumn[];
};

export function SearchTable<T extends Record<string, any>>(props: SearchTableProps<T>) {
	let first = props.columns[0]; // default search column
	const [column, setColumn] = createSignal<SearchColumn>(first, {
		equals: false,
	});

	const columnSelect = (e: MouseEvent) => {
		const target = e.target as HTMLElement;
		const columnName = target.dataset.colname;
		const name = target.dataset.name;
		const type = target.dataset.type as SearchColumn["type"];
		if (!columnName || !name || !type) return;
		setColumn({ columnName, name, type });
	};

	let debounce = new UpdateHandler({
		timer: 250,
	});
	const searchHandler = (e: Event) => {
		const target = e.target as HTMLInputElement;
		debounce.reset({
			func: () => {
				const c = column();
				batch(() => {
					props.setSearchQuery("columnName", c.columnName);
					props.setSearchQuery("value", target.value);
					props.setSearchQuery("type", c.type);
				});
			},
		});
	};

	const clearSearch = () => {
		(document.getElementById("search") as HTMLInputElement).value = "";
		batch(() => {
			props.setSearchQuery("columnName", "");
			props.setSearchQuery("value", "=");
		});
	};

	return (
		<div class="relative flex flex-row flex-wrap max-sm:gap-y-2 max-sm:px-8 max-sm:justify-center max-sm:w-min border-[2px] border-red-900 px-4 py-2 gap-x-3 items-center rounded-[4px]">
			<div
				class="group relative w-max flex flex-row gap-x-2 !font-didact"
				onClick={(e) => columnSelect(e)}>
				<i class="fa-solid fa-magnifying-glass text-red-900 drop-shadow-md self-center"></i>
				<p class="py-1 px-3 w-full bg-red-300 text-red-900 font-bold text-sm cursor-pointer rounded-md shadow-md">
					{column().name} :
				</p>
				<div class="hidden absolute group-hover:flex flex-col bottom-0 left-0 translate-y-full w-max h-[max-content] font-bold text-base z-[1000] shadow-lg shadow-slate-500 rounded-md overflow-hidden ">
					<Index each={props.columns}>
						{(c) => (
							<p
								class="py-1 px-3 bg-red-50 hover:bg-red-200 text-red-900 cursor-pointer"
								data-colname={c().columnName}
								data-name={c().name}
								data-type={c().type}>
								{c().name}
							</p>
						)}
					</Index>
				</div>
			</div>
			<input
				id="search"
				class="px-4 py-1 max-sm:px-2 font-didact shadow-md text-lg max-sm:text-sm shadow-gray-400 rounded-md focus:shadow-gray-500 focus:shadow-lg focus-visible:outline-none max-sm:self-center"
				type="text"
				name="search"
				autocomplete="off"
				onKeyDown={(e) => searchHandler(e)}
				onChange={(e) => searchHandler(e)}
			/>
			<i
				class="absolute fa-solid fa-xmark text-red-900 drop-shadow-md right-4 max-sm:right-2 max-sm:top-2 sm:translate-x-[-25%] hover:bg-red-200 rounded-full p-2 text-lg max-sm:base leading-[0.9rem]  cursor-pointer text-center"
				onClick={(e) => clearSearch()}></i>
		</div>
	);
}
