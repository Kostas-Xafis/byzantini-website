import { createContext } from "solid-js";

export type ContextType = [
	number[],
	{
		add: (i: number) => void;
		addMany: (i: number[]) => void;
		remove: (i: number) => void;
		removeAll: () => void;
		removeMany: (i: number[]) => void;
	}
];
export const SelectedItemsContext = createContext<ContextType>();
