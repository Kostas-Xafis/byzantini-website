import { createContext } from "solid-js";
import type { Props as InputProps } from "../../Input.solid";

export type ContextType = {
	open: boolean;
	inputs: Record<string, Partial<InputProps>>;
	close: () => void;
	submitText: string;
	headerText: string;
};

export const ModalContext = createContext<ContextType>();
