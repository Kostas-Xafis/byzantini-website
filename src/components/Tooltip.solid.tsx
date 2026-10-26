export type TooltipProps = {
	message: string[];
	position: "top" | "bottom" | "left" | "right";
};

export default function Tooltip(props: TooltipProps) {
	return props.position === "left" ? (
		<ul
			class={
				"absolute w-[25ch] p-8 pt-6 bg-red-100 dark:bg-dark text-red-950 dark:text-red-50 shadow-md shadow-gray-500 dark:shadow-gray-700 rounded-md left-[calc(-25ch_-_2rem)] top-8 translate-y-[-50%] grid auto-rows-max gap-y-2" +
				" opacity-[0.0001] z-[-100] transition-opacity duration-300 group-focus-within/tooltip:opacity-100 group-focus-within/tooltip:z-[5000] group-[:not(:focus-within)]/tooltip:duration-0 group-[:not(:focus-within)]/tooltip:opacity-[0.0001]"
			}>
			<li class="justify-self-center">
				<i class="fa-solid fa-circle-info text-[clamp(1.5rem,2.2vw,2.5rem)] text-red-900 dark:text-red-300"></i>
			</li>
			{props.message.map((message) => (
				<li class="text-lg drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)]">
					<i class="fa-solid fa-circle-chevron-right text-[clamp(0.875rem,1.25vw,1.5rem)] pr-4 text-red-900 dark:text-red-300 drop-shadow-none"></i>
					{message}
				</li>
			))}
			<li
				class={
					"absolute right-[-25px] top-[calc(50%_-_25px)] border-[25px] border-red-100 dark:border-gray-800 border-t-transparent border-b-transparent border-r-0" +
					" after:absolute after:right-[0px] after:top-[calc(50%_-_24px)] after:border-[26px] after:border-gray-500 dark:after:border-gray-700 after:border-t-transparent after:border-b-transparent after:border-r-0 after:blur-[2px] after:-z-10" +
					" before:absolute before:w-[5px] before:h-[100px] before:left-[-30px] before:translate-y-[-50%] before:bg-red-100 dark:before:bg-dark"
				}></li>
		</ul>
	) : props.position === "right" ? (
		<ul
			class={
				"absolute w-[25ch] p-8 pt-6 bg-red-100 dark:bg-dark text-red-950 dark:text-red-50 shadow-md shadow-gray-500 dark:shadow-gray-700 rounded-md right-[calc(-25ch_-_2rem)] top-8 translate-y-[-50%] grid auto-rows-max gap-y-2" +
				" opacity-[0.0001] z-[-100] transition-opacity duration-300 group-focus-within/tooltip:opacity-100 group-focus-within/tooltip:z-[5000] group-[:not(:focus-within)]/tooltip:duration-0 group-[:not(:focus-within)]/tooltip:opacity-[0.0001]"
			}>
			<li class="justify-self-center">
				<i class="fa-solid fa-circle-info text-[clamp(1.5rem,2.2vw,2.5rem)] text-red-900 dark:text-red-300"></i>
			</li>
			{props.message.map((message) => (
				<li class="text-[clamp(0.875rem,1.25vw,1.5rem)] drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)]">
					<i class="fa-solid fa-circle-chevron-right text-[clamp(0.875rem,1.25vw,1.5rem)] pr-4 text-red-900 dark:text-red-300 drop-shadow-none"></i>
					{message}
				</li>
			))}
			<li
				class={
					"absolute left-[-25px] top-[calc(50%_-_25px)] border-[25px] border-red-100 dark:border-gray-800 border-t-transparent border-b-transparent border-l-0" +
					" after:absolute after:left-[0px] after:top-[calc(50%_-_24px)] after:border-[26px] after:border-gray-500 dark:after:border-gray-700 after:border-t-transparent after:border-b-transparent after:border-l-0 after:blur-[2px] after:-z-10" +
					" before:absolute before:w-[5px] before:h-[100px] before:right-[-30px] before:translate-y-[-50%] before:bg-red-100 dark:before:bg-dark"
				}></li>
		</ul>
	) : props.position === "top" ? (
		<ul
			class={
				"absolute h-max w-full p-2 pt-1 bg-red-100 dark:bg-dark text-red-950 dark:text-red-50 shadow-md shadow-gray-500 dark:shadow-gray-700 rounded-md -top-8 translate-y-[-100%] left-[50%] translate-x-[-50%] flex flex-col gap-1" +
				" opacity-[0.0001] z-[-100] transition-opacity duration-300 group-focus-within/tooltip:opacity-100 group-focus-within/tooltip:z-[5000] group-[:not(:focus-within)]/tooltip:duration-0 group-[:not(:focus-within)]/tooltip:opacity-[0.0001]"
			}>
			<li class="text-center flex-grow-[2]">
				<i class="fa-solid fa-circle-info text-xl text-red-900 dark:text-red-300"></i>
			</li>
			<div class="w-full flex flex-row justify-evenly">
				{props.message.map((message) => (
					<li class="text-sm max-w-[20ch] drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)]">
						<i class="fa-solid fa-circle-chevron-right text-sm pr-4 text-red-900 dark:text-red-300 drop-shadow-none"></i>
						{message}
					</li>
				))}
			</div>
			<li
				class={
					"absolute bottom-[-25px] left-[calc(50%_-_25px)] border-[25px] border-red-100 dark:border-gray-800 border-l-transparent border-r-transparent border-b-0" +
					" after:absolute after:bottom-[0px] after:left-[calc(50%_-_26px)] after:border-[26px] after:border-gray-500 dark:after:border-gray-700 after:border-l-transparent after:border-r-transparent after:border-b-0 after:blur-[2px] after:-z-10" +
					" before:absolute before:h-[5px] before:w-[100px] before:top-[-30px] before:translate-x-[-50%] before:bg-red-100 dark:before:bg-dark"
				}></li>
		</ul>
	) : (
		// A compact popover just under the field, never wider than it — so it stays on screen on phones too.
		<ul
			class={
				"absolute inset-x-1 top-[calc(100%_+_0.6rem)] grid h-max gap-y-1 rounded-xl bg-red-50 px-3 py-2.5 font-didact text-sm text-red-950 shadow-lg shadow-black/15 ring-1 ring-red-900/15 dark:bg-neutral-800 dark:text-red-50 dark:shadow-black/40 dark:ring-white/10" +
				" opacity-[0.0001] z-[-100] transition-opacity duration-300 group-focus-within/tooltip:opacity-100 group-focus-within/tooltip:z-[5000] group-[:not(:focus-within)]/tooltip:duration-0 group-[:not(:focus-within)]/tooltip:opacity-[0.0001]"
			}>
			<li
				aria-hidden="true"
				class="absolute -top-1.5 left-5 size-3 rotate-45 border-t border-l border-red-900/15 bg-red-50 dark:border-white/10 dark:bg-neutral-800"></li>
			{props.message.map((message) => (
				<li class="relative flex items-start gap-x-2">
					<i class="fa-solid fa-circle-info mt-0.5 text-red-900 dark:text-red-300" aria-hidden="true"></i>
					<span>{message}</span>
				</li>
			))}
		</ul>
	);
}
