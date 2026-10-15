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
				"flex items-center justify-center aspect-square rounded-xl text-ink-muted bg-ink/5 hover:bg-ink/15 focus-visible:outline-2 focus-visible:outline-accent-ink closeBtn " +
				(props.classes || "")
			}
			aria-label={props.label ?? "Κλείσιμο"}
			title={props.label ?? "Κλείσιμο"}
			onclick={props.onClick}>
			<i aria-hidden="true" class="w-full fa-solid fa-xmark"></i>
		</button>
	);
}
