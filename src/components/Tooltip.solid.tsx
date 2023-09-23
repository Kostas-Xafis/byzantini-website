export type TooltipProps = {
	message: string[];
	position: "top" | "bottom" | "left" | "right";
};

/**
 * A tooltip component must be used inside a relative container
 * @param props
 * @returns
 */
export default function Tooltip(props: TooltipProps) {
	return props.position === "left" ? (
		<ul
			class={
				"absolute w-[25ch] p-8 pt-6 bg-red-100 shadow-md shadow-gray-500 rounded-md left-[calc(-25ch_-_2rem)] top-8 translate-y-[-50%] grid auto-rows-max gap-y-2" +
				" opacity-[0.0001] z-[-100] transition-opacity duration-300 group-focus-within/tooltip:opacity-100 group-focus-within/tooltip:z-[5000] group-[:not(:focus-within)]/tooltip:duration-0 group-[:not(:focus-within)]/tooltip:opacity-[0.0001]"
			}
		>
			<li class="justify-self-center">
				<i class="fa-solid fa-circle-info text-4xl text-red-900"></i>
			</li>
			{props.message.map((message) => (
				<li class="text-lg drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)]">
					<i class="fa-solid fa-circle-chevron-right text-lg pr-4 text-red-900 drop-shadow-none"></i>
					{message}
				</li>
			))}
			<li
				class={
					"absolute right-[-25px] top-[calc(50%_-_25px)] border-[25px] border-red-100 border-t-transparent border-b-transparent border-r-0" +
					" after:absolute after:right-[0px] after:top-[calc(50%_-_24px)] after:border-[26px] after:border-gray-500 after:border-t-transparent after:border-b-transparent after:border-r-0 after:blur-[2px] after:-z-10" +
					" before:absolute before:w-[5px] before:h-[100px] before:left-[-30px] before:translate-y-[-50%] before:bg-red-100"
				}
			></li>
		</ul>
	) : props.position === "right" ? (
		<ul
			class={
				"absolute w-[25ch] p-8 pt-6 bg-red-100 shadow-md shadow-gray-500 rounded-md right-[calc(-25ch_-_2rem)] top-8 translate-y-[-50%] grid auto-rows-max gap-y-2" +
				" opacity-[0.0001] z-[-100] transition-opacity duration-300 group-focus-within/tooltip:opacity-100 group-focus-within/tooltip:z-[5000] group-[:not(:focus-within)]/tooltip:duration-0 group-[:not(:focus-within)]/tooltip:opacity-[0.0001]"
			}
		>
			<li class="justify-self-center">
				<i class="fa-solid fa-circle-info text-4xl text-red-900"></i>
			</li>
			{props.message.map((message) => (
				<li class="text-lg drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)]">
					<i class="fa-solid fa-circle-chevron-right text-lg pr-4 text-red-900 drop-shadow-none"></i>
					{message}
				</li>
			))}
			<li
				class={
					"absolute left-[-25px] top-[calc(50%_-_25px)] border-[25px] border-red-100 border-t-transparent border-b-transparent border-l-0" +
					" after:absolute after:left-[0px] after:top-[calc(50%_-_24px)] after:border-[26px] after:border-gray-500 after:border-t-transparent after:border-b-transparent after:border-l-0 after:blur-[2px] after:-z-10" +
					" before:absolute before:w-[5px] before:h-[100px] before:right-[-30px] before:translate-y-[-50%] before:bg-red-100"
				}
			></li>
		</ul>
	) : props.position === "top" ? (
		<ul
			class={
				"absolute h-max w-full p-2 pt-1 bg-red-100 shadow-md shadow-gray-500 rounded-md -top-8 translate-y-[-100%] left-[50%] translate-x-[-50%] flex flex-col gap-1" +
				" opacity-[0.0001] z-[-100] transition-opacity duration-300 group-focus-within/tooltip:opacity-100 group-focus-within/tooltip:z-[5000] group-[:not(:focus-within)]/tooltip:duration-0 group-[:not(:focus-within)]/tooltip:opacity-[0.0001]"
			}
		>
			<li class="text-center flex-grow-[2]">
				<i class="fa-solid fa-circle-info text-xl text-red-900"></i>
			</li>
			<div class="w-full flex flex-row justify-evenly">
				{props.message.map((message) => (
					<li class="text-sm max-w-[20ch] drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)]">
						<i class="fa-solid fa-circle-chevron-right text-sm pr-4 text-red-900 drop-shadow-none"></i>
						{message}
					</li>
				))}
			</div>
			<li
				class={
					"absolute bottom-[-25px] left-[calc(50%_-_25px)] border-[25px] border-red-100 border-l-transparent border-r-transparent border-b-0" +
					" after:absolute after:bottom-[0px] after:left-[calc(50%_-_26px)] after:border-[26px] after:border-gray-500 after:border-l-transparent after:border-r-transparent after:border-b-0 after:blur-[2px] after:-z-10" +
					" before:absolute before:h-[5px] before:w-[100px] before:top-[-30px] before:translate-x-[-50%] before:bg-red-100"
				}
			></li>
		</ul>
	) : (
		<ul
			class={
				"absolute h-max p-8 pt-6 bg-red-100 shadow-md shadow-gray-500 rounded-md top-[calc(100%_+_2rem)] left-[-50%] grid-rows-[max-content_1fr] grid grid-flow-col auto-cols-[25ch] gap-4" +
				" opacity-[0.0001] z-[-100] transition-opacity duration-300 group-focus-within/tooltip:opacity-100 group-focus-within/tooltip:z-[5000] group-[:not(:focus-within)]/tooltip:duration-0 group-[:not(:focus-within)]/tooltip:opacity-[0.0001]"
			}
		>
			<li class="justify-self-center" style={{ "grid-column": "1 / 3" }}>
				<i class="fa-solid fa-circle-info text-4xl text-red-900"></i>
			</li>
			{props.message.map((message) => (
				<li class="text-lg drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)]">
					<i class="fa-solid fa-circle-chevron-right text-lg pr-4 text-red-900 drop-shadow-none"></i>
					{message}
				</li>
			))}
			<li
				class={
					"absolute top-[-25px] left-[calc(50%_-_25px)] border-[25px] border-red-100 border-l-transparent border-r-transparent border-t-0" +
					" after:absolute after:top-[0px] after:left-[calc(50%_-_26px)] after:border-[26px] after:border-gray-500 after:border-l-transparent after:border-r-transparent after:border-t-0 after:blur-[2px] after:-z-10" +
					" before:absolute before:h-[5px] before:w-[100px] before:bottom-[-30px] before:translate-x-[-50%] before:bg-red-100"
				}
			></li>
		</ul>
	);
}
