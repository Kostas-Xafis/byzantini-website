import Icon from "@components/other/Icon.solid";
import { For, createSignal, onCleanup, onMount } from "solid-js";

type Position = "top" | "bottom" | "left" | "right";

export type TooltipProps = {
	message: string[];
	position: Position;
	/** Lets the field point at the tooltip (`aria-describedby`). */
	id?: string;
};

/** Room kept clear above a tooltip for the fixed site navbar (4.25rem) — less than that and it opens below instead. */
const SAFE_TOP = 76;
/** Minimum gap between a tooltip and the viewport's side edges. */
const SAFE_SIDE = 8;

// Tailwind only sees literal class names, hence one full string per position.
const PLACEMENT: Record<Position, string> = {
	left: "w-[25ch] p-8 pt-6 left-[calc(-25ch-2rem)] top-8 -translate-y-1/2 auto-rows-max gap-y-2 group-focus-within/tooltip:grid",
	right: "w-[25ch] p-8 pt-6 right-[calc(-25ch-2rem)] top-8 -translate-y-1/2 auto-rows-max gap-y-2 group-focus-within/tooltip:grid",
	top: "h-max w-full p-2 pt-1 -top-8 -translate-y-full left-1/2 -translate-x-1/2 flex-col gap-1 group-focus-within/tooltip:flex",
	bottom: "h-max w-full p-2 pt-1 top-[calc(100%+2rem)] left-1/2 -translate-x-1/2 flex-col gap-1 group-focus-within/tooltip:flex",
};

// The arrow: a CSS triangle pointing at the field, a blurred copy of it as its shadow, and a strip hiding the seam.
const ARROW: Record<Position, string> = {
	left:
		"-right-6.25 top-[calc(50%-25px)] border-t-transparent border-b-transparent border-r-0" +
		" after:right-0 after:top-[calc(50%-24px)] after:border-t-transparent after:border-b-transparent after:border-r-0" +
		" before:w-1.25 before:h-25 before:-left-7.5 before:-translate-y-1/2",
	right:
		"-left-6.25 top-[calc(50%-25px)] border-t-transparent border-b-transparent border-l-0" +
		" after:left-0 after:top-[calc(50%-24px)] after:border-t-transparent after:border-b-transparent after:border-l-0" +
		" before:w-1.25 before:h-25 before:-right-7.5 before:-translate-y-1/2",
	top:
		"-bottom-6.25 left-[calc(50%-25px)] border-l-transparent border-r-transparent border-b-0" +
		" after:bottom-0 after:left-[calc(50%-26px)] after:border-l-transparent after:border-r-transparent after:border-b-0" +
		" before:h-1.25 before:w-25 before:-top-7.5 before:-translate-x-1/2",
	bottom:
		"-top-6.25 left-[calc(50%-25px)] border-l-transparent border-r-transparent border-t-0" +
		" after:top-0 after:left-[calc(50%-26px)] after:border-l-transparent after:border-r-transparent after:border-t-0" +
		" before:h-1.25 before:w-25 before:-bottom-7.5 before:-translate-x-1/2",
};

/**
 * A hint shown while its field (the nearest `group/tooltip`) has focus. It is `display: none` otherwise, so a
 * hidden tooltip never widens the page; on focus it opens on the requested side and, when that side has no
 * room in the viewport (side tooltips on a narrow window, a top one under the navbar), above or below instead.
 * Inside dashboard modals `.modal-form [data-tooltip]` (global.css) restyles it and always opens it below.
 */
export default function Tooltip(props: TooltipProps) {
	const [placement, setPlacement] = createSignal<Position>(props.position);
	let tooltip!: HTMLUListElement;

	const fits = () => {
		const rect = tooltip.getBoundingClientRect();
		return rect.left >= SAFE_SIDE && rect.right <= document.documentElement.clientWidth - SAFE_SIDE && rect.top >= SAFE_TOP;
	};
	// Runs on focusin, when `:focus-within` already shows the tooltip: each candidate is applied and measured.
	const place = () => {
		const candidates: Position[] = [props.position, ...(["top", "bottom"] as const).filter((p) => p !== props.position)];
		for (const candidate of candidates) {
			setPlacement(candidate);
			if (fits()) return;
		}
		setPlacement(props.position === "top" ? "bottom" : "top");
	};

	onMount(() => {
		const field = tooltip.parentElement;
		if (!field) return;
		field.addEventListener("focusin", place);
		onCleanup(() => field.removeEventListener("focusin", place));
	});

	const isSide = () => placement() === "left" || placement() === "right";
	const messageClass = () => (isSide() ? "text-[clamp(0.875rem,1.25vw,1.5rem)]" : "text-sm max-w-[20ch]");
	const messages = () => (
		<For each={props.message}>
			{(message) => (
				<li class={messageClass() + " drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)]"}>
					<Icon
						name="chevron-circle-right"
						class={(isSide() ? "text-[clamp(0.875rem,1.25vw,1.5rem)]" : "text-sm") + " pr-4 text-red-900 dark:text-red-300 drop-shadow-none"}
					/>
					{message}
				</li>
			)}
		</For>
	);

	return (
		<ul
			ref={tooltip}
			id={props.id}
			data-tooltip={placement()}
			class={
				"absolute hidden z-5000 bg-red-100 dark:bg-dark text-red-950 dark:text-red-50 shadow-md shadow-gray-500 dark:shadow-gray-700 rounded-md" +
				" transition-opacity duration-300 starting:opacity-0 " +
				PLACEMENT[placement()]
			}>
			<li class={isSide() ? "justify-self-center" : "text-center"}>
				<Icon name="info" class={(isSide() ? "text-[clamp(1.5rem,2.2vw,2.5rem)]" : "text-xl") + " text-red-900 dark:text-red-300"} />
			</li>
			{isSide() ? (
				messages()
			) : (
				<li>
					<ul class="w-full flex flex-row justify-evenly gap-x-2">{messages()}</ul>
				</li>
			)}
			<li
				aria-hidden="true"
				class={
					"absolute border-25 border-red-100 dark:border-gray-800 after:absolute after:border-26 after:border-gray-500 dark:after:border-gray-700 after:blur-[2px] after:-z-10" +
					" before:absolute before:bg-red-100 dark:before:bg-dark " +
					ARROW[placement()]
				}></li>
		</ul>
	);
}
