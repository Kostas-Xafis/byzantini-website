import { customEvent } from "@_types/custom-events";
import { getParent } from "@utilities/dom";
import { Show, createEffect, createMemo, on, type Accessor } from "solid-js";
import { createStore } from "solid-js/store";

export type Page = {
	page: number;
	pageSize: number;
	dataSize: number;
};

type Props = {
	pageSize: number;
	dataSize: Accessor<number>;
};

export default function Pagination({ pageSize, dataSize }: Props) {
	const [pagination, setPagination] = createStore<Page>({
		page: 0,
		pageSize,
		dataSize: dataSize(),
	});
	createEffect(
		on(dataSize, () => {
			setPagination((prev) => ({ ...prev, dataSize: dataSize() }));
		})
	);

	const maxPage = createMemo(() => Math.ceil(pagination.dataSize / pagination.pageSize));

	const onClickPagination = (e: MouseEvent) => {
		const btn = getParent(e.target as HTMLElement, "button");
		if (!btn || btn.dataset.active === "false") {
			return;
		}
		const pageTurn = Number(btn.dataset["pageturn"]);
		if (pageTurn === 0) {
			return;
		}
		setPagination((prev) => {
			const page = prev.page + pageTurn;
			document.dispatchEvent(
				customEvent("onTablePageChange", { page, pageSize, dataSize: pagination.dataSize })
			);
			return { ...prev, page };
		});
		document.dispatchEvent(new CustomEvent("hydrate"));
	};

	return (
		<Show when={pagination.pageSize < pagination.dataSize}>
			<div
				id="pagination"
				class="pb-4 flex flex-row justify-center gap-x-2 font-didact text-2xl text-red-950"
				onClick={onClickPagination}>
				<button
					data-active={pagination.page - 1 >= 0}
					class="group/pgBtn transition-all rounded px-2 data-[active=true]:hover:shadow-md data-[active=true]:hover:shadow-gray-400 data-[active=true]:hover:bg-red-950 data-[active=true]:hover:text-white"
					data-pageTurn="-1"
					type="button">
					<i class="text-xl py-[2px] fa-solid fa-arrow-left group-data-[active=false]/pgBtn:text-gray-300"></i>
				</button>
				{maxPage() > 1 && pagination.page - 1 >= 0 && (
					<button
						class="transition-all rounded px-2 hover:shadow-md hover:shadow-gray-400 hover:bg-red-950 hover:text-white"
						data-pageTurn="-1"
						type="button">
						{pagination.page}
					</button>
				)}
				<button
					class="relative transition-all rounded px-2 hover:shadow-md hover:shadow-gray-400 hover:bg-red-950 hover:text-white hover:before:hidden before:absolute before:bottom-0 before:inset-x-0 before:h-[1px] before:bg-red-950 before:z-[10]"
					data-pageTurn="0"
					type="button">
					{pagination.page + 1}
				</button>
				{maxPage() >= 2 && pagination.page + 1 < maxPage() && (
					<button
						class="transition-all rounded px-2 hover:shadow-md hover:shadow-gray-400 hover:bg-red-950 hover:text-white"
						data-pageTurn="1"
						type="button">
						{pagination.page + 2}
					</button>
				)}
				<button
					data-active={pagination.page + 1 < maxPage()}
					class="group/pgBtn transition-all rounded px-2 data-[active=true]:hover:shadow-md data-[active=true]:hover:shadow-gray-400 data-[active=true]:hover:bg-red-950 data-[active=true]:hover:text-white"
					data-pageTurn="1"
					type="button">
					<i class="text-xl py-[2px] fa-solid fa-arrow-right group-data-[active=false]/pgBtn:text-gray-300"></i>
				</button>
			</div>
		</Show>
	);
}
