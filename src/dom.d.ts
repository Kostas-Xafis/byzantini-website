import type { TypeEffect } from "../lib/hooks/useSelectedRows.solid.ts";
type CustomEventMap = {
	emptyFileRemove: CustomEvent<string>;
	hydrate: CustomEvent<undefined>;
	ModifySelections: CustomEvent<TypeEffect>;
	FormCleanup: CustomEvent<{ prefix: string; }>;
	FormMount: CustomEvent<{ prefix: string; }>;
};

declare global {
	// interface Document { //adds definition to Document, but you can do the same with HTMLElement
	// 	addEventListener<K extends keyof CustomEventMap>(type: K,
	// 		listener: (this: Document, ev: CustomEventMap[K]) => void): void;
	// 	dispatchEvent<K extends keyof CustomEventMap>(ev: CustomEventMap[K]): void;
	// 	removeEventListener<K extends keyof CustomEventMap>(type: K,
	// 		listener: (this: Document, ev: CustomEventMap[K]) => void): void;
	// }
	// Better alternative that covers all elements and not just Document
	interface GlobalEventHandlersEventMap {
		emptyFileRemove: CustomEvent<string>;
		hydrate: CustomEvent<undefined>;
		openCarousel: CustomEvent<{ index: number; }>;
		closeCarousel: CustomEvent<undefined>;
		ModifySelections: CustomEvent<TypeEffect>;
		FormCleanup: CustomEvent<{ prefix: string; }>;
		FormMount: CustomEvent<{ prefix: string; }>;
		ModalClose: CustomEvent<{ prefix: string; }>;
	}
}

export { };
