type Props = {
	onClick?: (e: MouseEvent) => void;
	classes?: string;
};

export function CloseButton(props: Props) {
	return (
		<button
			type="button"
			class={
				"flex items-center aspect-square rounded-xl hover:bg-gray-300 closeBtn " +
				(props.classes || "")
			}
			onclick={props.onClick}>
			<i class="w-full fa-solid fa-xmark"></i>
		</button>
	);
}
