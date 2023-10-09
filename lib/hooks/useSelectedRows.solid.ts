import { createStore } from "solid-js/store";

export function useSelectedRows() {
	const [selectedItems, setSelectedItems] = createStore<number[]>([]);

	document.addEventListener("RemoveAllRows", (e) => setSelectedItems([]));

	return [
		selectedItems,
		{
			add: (id: number) => {
				setSelectedItems([...selectedItems, id]);
			},
			addMany: (ids: number[]) => {
				setSelectedItems([...new Set([...selectedItems, ...ids])]);
			},
			remove: (id: number) => {
				setSelectedItems(selectedItems.filter((i) => i !== id));
			},
			removeMany: (ids: number[]) => {
				setSelectedItems(selectedItems.filter((i) => !ids.includes(i)));
			},
			removeAll: () => {
				setSelectedItems([]);
			},
		},
	] as const;
}
