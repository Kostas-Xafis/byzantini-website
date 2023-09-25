
import { setLoading } from "./Modal.solid";
export const formListener = (onSubmit: (e: Event) => (Promise<void> | void), set = true, prefix: string) => {
	const form = document.querySelector(`.controlsContainer[data-prefix='${prefix}'] form`) as HTMLFormElement | null;
	if (!form) return;

	if (set) form.addEventListener("submit", onSubmit, { capture: true });
	else form.removeEventListener("submit", onSubmit, true);
};

export const formErrorWrap = (onSubmit: (e: Event) => Promise<any>) => {
	return async function (e: Event) {
		try {
			await onSubmit(e);
			setLoading(false);
		} catch (error) {
			console.error(error);
			const form = document.querySelector(".modal:is(:not(.hidden)) > div > form") as HTMLFormElement;
			setLoading(false);
			void form.report;
			form.classList.add("animate-shake");
			setTimeout(() => form.classList.remove("animate-shake"), 500);
		}
	};
};
