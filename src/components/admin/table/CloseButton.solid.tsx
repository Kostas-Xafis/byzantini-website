type Props = {
	onClick?: (e: MouseEvent) => void;
	classes?: string;
};

export function CloseButton(props: Props) {
	return (
		<button
			type="button"
			class={
				"flex items-center justify-center aspect-square rounded-xl text-gray-700 dark:text-gray-200 bg-gray-100/80 dark:bg-gray-800/80 hover:bg-gray-300 dark:hover:bg-gray-700 closeBtn " +
				(props.classes || "")
			}
			onclick={props.onClick}>
			<i class="w-full fa-solid fa-xmark"></i>
		</button>
	);
}
