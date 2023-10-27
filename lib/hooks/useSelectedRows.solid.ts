import { createStore } from "solid-js/store";

export const enum TypeEffectEnum {
	ADD = "ADD",
	ADD_MANY = "ADD_MANY",
	REMOVE = "REMOVE",
	REMOVE_MANY = "REMOVE_MANY",
	REMOVE_ALL = "REMOVE_ALL",
}

export type TypeEffect =
	| {
		type: TypeEffectEnum.ADD | TypeEffectEnum.REMOVE;
		id: number;
	}
	| {
		type: TypeEffectEnum.ADD_MANY | TypeEffectEnum.REMOVE_MANY;
		ids: number[];
	}
	| {
		type: TypeEffectEnum.REMOVE_ALL;
	};


export function useSelectedRows() {
	const [selectedItems, setSelectedItems] = createStore<number[]>([]);

	const mutateItems = (effect: TypeEffect) => {
		const type = effect.type;
		switch (type) {
			case TypeEffectEnum.ADD:
				setSelectedItems([...selectedItems, effect.id]);
				break;
			case TypeEffectEnum.ADD_MANY:
				setSelectedItems([...new Set([...selectedItems, ...effect.ids])]);
				break;
			case TypeEffectEnum.REMOVE:
				setSelectedItems(selectedItems.filter((i) => i !== effect.id));
				break;
			case TypeEffectEnum.REMOVE_MANY:
				setSelectedItems(selectedItems.filter((i) => !effect.ids.includes(i)));
				break;
			case TypeEffectEnum.REMOVE_ALL:
				setSelectedItems([]);
				break;
			default:
				break;
		}
	};

	document.addEventListener("ModifySelections", (e) => mutateItems(e.detail)); // For global access

	return [
		selectedItems,
		{
			add: (id: number) => mutateItems({ type: TypeEffectEnum.ADD, id }),
			addMany: (ids: number[]) => mutateItems({ type: TypeEffectEnum.ADD_MANY, ids }),
			remove: (id: number) => mutateItems({ type: TypeEffectEnum.REMOVE, id }),
			removeMany: (ids: number[]) => mutateItems({ type: TypeEffectEnum.REMOVE_MANY, ids }),
			removeAll: () => mutateItems({ type: TypeEffectEnum.REMOVE_ALL }),
		},
	] as const;
};
