import Icon from "@components/other/Icon.solid";
export type TooltipProps = {
	message: string[];
	position: "top" | "bottom" | "left" | "right";
};

export default function Tooltip(props: TooltipProps) {
	return props.position === "left" ? (
		<ul
			data-tooltip={props.position}
			class={
				"absolute w-[25ch] p-8 pt-6 bg-red-100 dark:bg-dark text-red-950 dark:text-red-50 shadow-md shadow-gray-500 dark:shadow-gray-700 rounded-md left-[calc(-25ch-2rem)] top-8 translate-y-[-50%] grid auto-rows-max gap-y-2" +
				" opacity-[0.0001] z-[-100] transition-opacity duration-300 group-focus-within/tooltip:opacity-100 group-focus-within/tooltip:z-5000 group-not-focus-within/tooltip:duration-0 group-not-focus-within/tooltip:opacity-[0.0001]"
			}>
			<li class="justify-self-center">
				<Icon name="info" class="text-[clamp(1.5rem,2.2vw,2.5rem)] text-red-900 dark:text-red-300" />
			</li>
			{props.message.map((message) => (
				<li class="text-lg drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)]">
					<Icon name="chevron-circle-right" class="text-[clamp(0.875rem,1.25vw,1.5rem)] pr-4 text-red-900 dark:text-red-300 drop-shadow-none" />
					{message}
				</li>
			))}
			<li
				class={
					"absolute -right-6.25 top-[calc(50%-25px)] border-25 border-red-100 dark:border-gray-800 border-t-transparent border-b-transparent border-r-0" +
					" after:absolute after:right-0 after:top-[calc(50%-24px)] after:border-26 after:border-gray-500 dark:after:border-gray-700 after:border-t-transparent after:border-b-transparent after:border-r-0 after:blur-[2px] after:-z-10" +
					" before:absolute before:w-1.25 before:h-25 before:-left-7.5 before:translate-y-[-50%] before:bg-red-100 dark:before:bg-dark"
				}></li>
		</ul>
	) : props.position === "right" ? (
		<ul
			data-tooltip={props.position}
			class={
				"absolute w-[25ch] p-8 pt-6 bg-red-100 dark:bg-dark text-red-950 dark:text-red-50 shadow-md shadow-gray-500 dark:shadow-gray-700 rounded-md right-[calc(-25ch-2rem)] top-8 translate-y-[-50%] grid auto-rows-max gap-y-2" +
				" opacity-[0.0001] z-[-100] transition-opacity duration-300 group-focus-within/tooltip:opacity-100 group-focus-within/tooltip:z-5000 group-not-focus-within/tooltip:duration-0 group-not-focus-within/tooltip:opacity-[0.0001]"
			}>
			<li class="justify-self-center">
				<Icon name="info" class="text-[clamp(1.5rem,2.2vw,2.5rem)] text-red-900 dark:text-red-300" />
			</li>
			{props.message.map((message) => (
				<li class="text-[clamp(0.875rem,1.25vw,1.5rem)] drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)]">
					<Icon name="chevron-circle-right" class="text-[clamp(0.875rem,1.25vw,1.5rem)] pr-4 text-red-900 dark:text-red-300 drop-shadow-none" />
					{message}
				</li>
			))}
			<li
				class={
					"absolute -left-6.25 top-[calc(50%-25px)] border-25 border-red-100 dark:border-gray-800 border-t-transparent border-b-transparent border-l-0" +
					" after:absolute after:left-0 after:top-[calc(50%-24px)] after:border-26 after:border-gray-500 dark:after:border-gray-700 after:border-t-transparent after:border-b-transparent after:border-l-0 after:blur-[2px] after:-z-10" +
					" before:absolute before:w-1.25 before:h-25 before:-right-7.5 before:translate-y-[-50%] before:bg-red-100 dark:before:bg-dark"
				}></li>
		</ul>
	) : props.position === "top" ? (
		<ul
			data-tooltip={props.position}
			class={
				"absolute h-max w-full p-2 pt-1 bg-red-100 dark:bg-dark text-red-950 dark:text-red-50 shadow-md shadow-gray-500 dark:shadow-gray-700 rounded-md -top-8 -translate-y-full left-[50%] translate-x-[-50%] flex flex-col gap-1" +
				" opacity-[0.0001] z-[-100] transition-opacity duration-300 group-focus-within/tooltip:opacity-100 group-focus-within/tooltip:z-5000 group-not-focus-within/tooltip:duration-0 group-not-focus-within/tooltip:opacity-[0.0001]"
			}>
			<li class="text-center grow-2">
				<Icon name="info" class="text-xl text-red-900 dark:text-red-300" />
			</li>
			<div class="w-full flex flex-row justify-evenly">
				{props.message.map((message) => (
					<li class="text-sm max-w-[20ch] drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)]">
						<Icon name="chevron-circle-right" class="text-sm pr-4 text-red-900 dark:text-red-300 drop-shadow-none" />
						{message}
					</li>
				))}
			</div>
			<li
				class={
					"absolute -bottom-6.25 left-[calc(50%-25px)] border-25 border-red-100 dark:border-gray-800 border-l-transparent border-r-transparent border-b-0" +
					" after:absolute after:bottom-0 after:left-[calc(50%-26px)] after:border-26 after:border-gray-500 dark:after:border-gray-700 after:border-l-transparent after:border-r-transparent after:border-b-0 after:blur-[2px] after:-z-10" +
					" before:absolute before:h-1.25 before:w-25 before:-top-7.5 before:translate-x-[-50%] before:bg-red-100 dark:before:bg-dark"
				}></li>
		</ul>
	) : (
		<ul
			data-tooltip={props.position}
			class={
				"absolute h-max p-8 pt-6 bg-red-100 dark:bg-dark text-red-950 dark:text-red-50 shadow-md shadow-gray-500 dark:shadow-gray-700 rounded-md top-[calc(100%+2rem)] left-[-50%] grid-rows-[max-content_1fr] grid grid-flow-col auto-cols-[25ch] gap-4" +
				" opacity-[0.0001] z-[-100] transition-opacity duration-300 group-focus-within/tooltip:opacity-100 group-focus-within/tooltip:z-5000 group-not-focus-within/tooltip:duration-0 group-not-focus-within/tooltip:opacity-[0.0001]"
			}>
			<li class="justify-self-center" style={{ "grid-column": "1 / 3" }}>
				<Icon name="info" class="text-[clamp(1.5rem,2.2vw,2.5rem)] text-red-900 dark:text-red-300" />
			</li>
			{props.message.map((message) => (
				<li class="text-[clamp(0.875rem,1.25vw,1.5rem)] drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)]">
					<Icon name="chevron-circle-right" class="text-[clamp(0.875rem,1.25vw,1.5rem)] pr-4 text-red-900 dark:text-red-300 drop-shadow-none" />
					{message}
				</li>
			))}
			<li
				class={
					"absolute -top-6.25 left-[calc(50%-25px)] border-25 border-red-100 dark:border-gray-800 border-l-transparent border-r-transparent border-t-0" +
					" after:absolute after:top-0 after:left-[calc(50%-26px)] after:border-26 after:border-gray-500 dark:after:border-gray-700 after:border-l-transparent after:border-r-transparent after:border-t-0 after:blur-[2px] after:-z-10" +
					" before:absolute before:h-1.25 before:w-25 before:-bottom-7.5 before:translate-x-[-50%] before:bg-red-100 dark:before:bg-dark"
				}></li>
		</ul>
	);
}
