import { createStore } from "solid-js/store";

export type TypeEffect =
	| {
		type: "add";
		id: number;
	}
	| {
		type: "addMany";
		ids: number[];
	}
	| {
		type: "remove";
		id: number;
	}
	| {
		type: "removeMany";
		ids: number[];
	}
	| {
		type: "removeAll";
	};


export function useSelectedRows() {
	const [selectedItems, setSelectedItems] = createStore<number[]>([]);

	const mutateItems = (effect: TypeEffect) => {
		const type = effect.type;
		switch (type) {
			case "add":
				setSelectedItems([...selectedItems, effect.id]);
				break;

			case "addMany":
				setSelectedItems([...new Set([...selectedItems, ...effect.ids])]);
				break;

			case "remove":
				setSelectedItems(selectedItems.filter((i) => i !== effect.id));
				break;

			case "removeMany":
				setSelectedItems(selectedItems.filter((i) => !effect.ids.includes(i)));
				break;

			case "removeAll":
				setSelectedItems([]);
				break;

			default:
				break;
		}
	};

	document.addEventListener("ModifySelections", (e) => mutateItems(e.detail));

	return [
		selectedItems,
		{
			add: (id: number) => mutateItems({ type: "add", id }),
			addMany: (ids: number[]) => mutateItems({ type: "addMany", ids }),
			remove: (id: number) => mutateItems({ type: "remove", id }),
			removeMany: (ids: number[]) => mutateItems({ type: "removeMany", ids }),
			removeAll: () => mutateItems({ type: "removeAll" }),
		},
	] as const;
};
