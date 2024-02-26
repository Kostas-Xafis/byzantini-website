import { createStore, type SetStoreFunction } from "solid-js/store";
import { untrack } from "solid-js";

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


export class SelectedRows {
	private selectedItems: number[];
	private setSelectedItems: SetStoreFunction<number[]>;
	private static eventListeners: Map<string, (e: CustomEvent<TypeEffect>) => void> = new Map();

	constructor() {
		let [si, ssi] = createStore<number[]>([]);
		this.selectedItems = si;
		this.setSelectedItems = ssi;
	}

	useSelectedRows() {
		if (SelectedRows.eventListeners.size) {
			SelectedRows.eventListeners.forEach((handler, path) => {
				document.removeEventListener("ModifySelections", handler);
				SelectedRows.eventListeners.delete(path);
			});
		}
		const eventHandler = (e: CustomEvent<TypeEffect>) => {
			this.mutateItems(e.detail);
		};
		document.addEventListener("ModifySelections", eventHandler);
		SelectedRows.eventListeners.set(window.location.pathname, eventHandler);

		return [
			this.selectedItems,
			{
				add: (id: number) => this.mutateItems({ type: TypeEffectEnum.ADD, id }),
				addMany: (ids: number[]) => this.mutateItems({ type: TypeEffectEnum.ADD_MANY, ids }),
				remove: (id: number) => this.mutateItems({ type: TypeEffectEnum.REMOVE, id }),
				removeMany: (ids: number[]) => this.mutateItems({ type: TypeEffectEnum.REMOVE_MANY, ids }),
				removeAll: () => this.mutateItems({ type: TypeEffectEnum.REMOVE_ALL }),
			},
		] as const;
	}

	mutateItems(effect: TypeEffect) {
		const type = effect.type;
		switch (type) {
			case TypeEffectEnum.ADD:
				this.setSelectedItems([...new Set([...this.selectedItems, effect.id])]);
				break;
			case TypeEffectEnum.ADD_MANY:
				this.setSelectedItems([...new Set([...this.selectedItems, ...effect.ids])]);
				break;
			case TypeEffectEnum.REMOVE:
				this.setSelectedItems(this.selectedItems.filter((i) => i !== effect.id));
				break;
			case TypeEffectEnum.REMOVE_MANY:
				this.setSelectedItems(this.selectedItems.filter((i) => !effect.ids.includes(i)));
				break;
			case TypeEffectEnum.REMOVE_ALL:
				this.setSelectedItems([]);
				break;
			default:
				break;
		}
	}
}

export function selectedRowsEvent<T extends TypeEffect>(detail: T) {
	// 🤯🤯🤯 Solid-js is actually insane: UI bugfix due to state change after toggleCheckboxes was being called
	// It also makes more sense, as I wouldn't want any state recalcuations to happen after a event dispatch
	const event = new CustomEvent("ModifySelections", { detail, cancelable: true, composed: true });
	untrack(() => {
		document.dispatchEvent(event);
	});
}
