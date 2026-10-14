import { AnimTimeline } from "@utilities/dom";
import { onBackdropClick, prefersReducedMotion, trapFocus } from "@utilities/focusTrap";
import { createEffect, createSignal, on, onCleanup, onMount, type JSX } from "solid-js";

type StringOrElement = string | JSX.Element;

export const PopupShow = () => document.getElementById("popup")?.dispatchEvent(new CustomEvent("show"));

export const PopupHide = () => document.getElementById("popup")?.dispatchEvent(new CustomEvent("hide"));

export interface Props {
	title: StringOrElement;
	content: string[] | StringOrElement;
	okButton?: StringOrElement;
	cancelButton?: StringOrElement;
	/** Runs when the (string) OK button is pressed, before the popup hides. */
	onOk?: () => void;
	/** Runs when the (string) cancel button is pressed, before the popup hides. */
	onCancel?: () => void;
	/** Runs after the popup has hidden, however it was closed. */
	onClose?: () => void;
}

const TITLE_ID = "popup-title";
const CONTENT_ID = "popup-content";

export default function Popup(props: Props) {
	const { title, okButton = "Εντάξει", cancelButton, onClose } = props;
	const [content, setContent] = createSignal<Props["content"]>(props.content);

	createEffect(on(() => props.content, setContent));

	let popup!: HTMLDivElement;
	let panel!: HTMLDivElement;
	let release: (() => void) | undefined;
	let visible = false;

	const hide = () => popup.dispatchEvent(new CustomEvent("hide"));

	onMount(() => {
		const onShow = () => {
			if (visible) return;
			visible = true;
			const atl = new AnimTimeline();
			atl.step(() => popup?.style && (popup.style.display = "grid"))
				.step(() => {
					popup?.classList.remove("hide");
					release = trapFocus(panel, {
						onEscape: hide,
						// The single OK button (or the OK of an OK/cancel pair) is the natural target.
						initialFocus: panel.querySelector<HTMLElement>("[data-popup-ok]") ?? "first",
					});
				})
				.start();
		};

		const onHide = async () => {
			if (!visible) return;
			visible = false;
			release?.();
			release = undefined;
			const atl = new AnimTimeline();
			await atl
				.step(() => popup?.classList.add("hide"))
				.step({
					// AnimTimeline skips timed steps with time 0, hence 1 ms.
					time: prefersReducedMotion() ? 1 : 300,
					anim: () => popup?.style && (popup.style.display = "none"),
				})
				.start();
			onClose?.();
		};

		popup.addEventListener("show", onShow);
		popup.addEventListener("hide", onHide);
		const offBackdrop = onBackdropClick(popup, hide);
		onCleanup(() => {
			popup.removeEventListener("show", onShow);
			popup.removeEventListener("hide", onHide);
			offBackdrop();
			release?.();
		});
	});

	const okClass = "text-2xl px-6 py-1 shadow-lg shadow-gray-400 rounded-lg transition-colors duration-300 bg-green-300 hover:bg-green-400 focus:bg-green-400";
	const cancelClass = "text-2xl px-6 py-1 shadow-lg shadow-gray-400 rounded-lg transition-colors duration-300 bg-red-300 hover:bg-red-400 focus:bg-red-400";

	return (
		<div ref={popup} id="popup" class="hide fixed inset-0 w-[100dvw] h-[100dvh] grid place-items-center backdrop-blur-[6px]" role="presentation">
			<div
				ref={panel}
				role="dialog"
				aria-modal="true"
				aria-labelledby={TITLE_ID}
				aria-describedby={CONTENT_ID}
				tabindex="-1"
				class="bg-white py-8 px-12 grid grid-cols-1 gap-y-6 justify-items-center rounded-md shadow-xl shadow-gray-600 focus-visible:outline-hidden">
				{typeof title === "string" ? (
					<h2 id={TITLE_ID} class="text-3xl font-didact [text-shadow:_-1px_1px_2px_rgb(35,_35,_35,_0.4)]">
						{title}
					</h2>
				) : (
					<div id={TITLE_ID} class="contents">
						{title}
					</div>
				)}
				<div id={CONTENT_ID} class="contents">
					{(() => {
						const c = content();
						if (typeof c === "string") return <p class="text-2xl font-didact ">{c}</p>;
						if (Array.isArray(c)) return (c as string[]).map((line) => <p class="text-2xl font-didact ">{line}</p>);
						return c;
					})()}
				</div>
				{cancelButton ? (
					<div class="grid grid-cols-2 gap-x-4">
						{typeof okButton === "string" ? (
							<button
								type="button"
								data-popup-ok
								class={okClass}
								onClick={() => {
									props.onOk?.();
									hide();
								}}>
								{okButton}
							</button>
						) : (
							okButton
						)}
						{typeof cancelButton === "string" ? (
							<button
								type="button"
								class={cancelClass}
								onClick={() => {
									props.onCancel?.();
									hide();
								}}>
								{cancelButton}
							</button>
						) : (
							cancelButton
						)}
					</div>
				) : typeof okButton === "string" ? (
					<button
						type="button"
						data-popup-ok
						onClick={() => {
							props.onOk?.();
							hide();
						}}
						class="px-8 py-2 text-2xl font-semibold rounded-xl text-red-50 bg-gradient-to-r from-red-800 to-red-900 shadow-lg shadow-red-950/30 ring-1 ring-red-950/20 transition-all duration-200 ease-out hover:shadow-xl hover:shadow-red-950/40 hover:from-red-900 hover:to-red-950 focus:outline-hidden focus:ring-2 focus:ring-red-900 focus:ring-offset-2 active:shadow-lg">
						{okButton}
					</button>
				) : (
					okButton
				)}
			</div>
			<style>
				{`
			#popup {
				opacity: 0;
				display: none;
				transition: opacity 0.3s ease-in-out;
				position: fixed;
				z-index: 99999;
			}

			#popup:is(:not(.hide)) {
				opacity: 1;
			}

			#popup:is(.hide) {
				opacity: 0;
			}

			@media (prefers-reduced-motion: reduce) {
				#popup {
					transition: none;
				}
			}`}
			</style>
		</div>
	);
}
