export const formListener = (onSubmit: (e: Event) => void, set = true, prefix: string) => {
	const form = document.querySelector(`.controlsContainer[data-prefix='${prefix}'] form`) as HTMLFormElement | null;
	if (!form) return;
	if (set) form.addEventListener("submit", onSubmit, { capture: true });
	else form.removeEventListener("submit", onSubmit, true);
};
