type Props = {
	onClick?: (e: MouseEvent) => void;
	classes?: string;
	/** Accessible name of the icon-only button. */
	label?: string;
};

export function CloseButton(props: Props) {
	return (
		<button
			type="button"
			class={
				"flex items-center justify-center aspect-square rounded-xl text-gray-700 dark:text-gray-200 bg-gray-100/80 dark:bg-gray-800/80 hover:bg-gray-300 dark:hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-red-900 dark:focus-visible:outline-red-300 closeBtn " +
				(props.classes || "")
			}
			aria-label={props.label ?? "Κλείσιμο"}
			title={props.label ?? "Κλείσιμο"}
			onclick={props.onClick}>
			<i aria-hidden="true" class="w-full fa-solid fa-xmark"></i>
		</button>
	);
}
