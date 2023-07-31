import { createContext } from "solid-js";

export type ContextType = [number[], { add: (i: number) => void; remove: (i: number) => void; removeAll: () => void }];
export const SelectedItemsContext = createContext<ContextType>();
