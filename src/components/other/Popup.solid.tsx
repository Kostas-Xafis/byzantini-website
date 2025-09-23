import { onMount, type JSX, createSignal, on, createEffect } from "solid-js";
import { AnimTimeline } from "../../../lib/utilities/dom";

type StringOrElement = string | JSX.Element;

export const PopupShow = () =>
	document.getElementById("popup")?.dispatchEvent(new CustomEvent("show"));

export const PopupHide = () =>
	document.getElementById("popup")?.dispatchEvent(new CustomEvent("hide"));

export interface Props {
	title: StringOrElement;
	content: string[] | StringOrElement;
	okButton?: StringOrElement;
	cancelButton?: StringOrElement;
	onClose?: () => void;
}

export default function Popup(props: Props) {
	const { title, okButton = "Εντάξει", cancelButton, onClose } = props;
	const [content, setContent] = createSignal<Props["content"]>(props.content);

	createEffect(on(() => props.content, setContent));

	let popup: HTMLElement | undefined = undefined;
	onMount(() => {
		popup?.addEventListener("show", (e) => {
			// if (e instanceof CustomEvent && e.detail && e.detail.id !== props.id) return;
			const atl = new AnimTimeline();
			atl.step(() => popup?.style && (popup.style.display = "grid"))
				.step(() => popup?.classList.remove("hide"))
				.start();
		});

		popup?.addEventListener("hide", async () => {
			// if (e instanceof CustomEvent && e.detail && e.detail.id !== props.id) return;
			const atl = new AnimTimeline();
			await atl
				.step(() => popup?.classList.add("hide"))
				.step({
					time: 300,
					anim: () => popup?.style && (popup.style.display = "none"),
				})
				.start();
			onClose?.();
		});
	});

	return (
		<div
			ref={popup}
			id="popup"
			class="hide fixed inset-0 w-[100dvw] h-[100dvh] grid place-items-center backdrop-blur-[6px]">
			<div class="bg-white py-8 px-12 grid grid-cols-1 gap-y-6 justify-items-center rounded-md shadow-xl shadow-gray-600">
				{typeof title === "string" ? (
					<h2 class="text-3xl font-didact [text-shadow:_-1px_1px_2px_rgb(35,_35,_35,_0.4)]">
						{title}
					</h2>
				) : (
					title
				)}
				{typeof content() === "string" ? (
					<p class="text-2xl font-didact ">{content()}</p>
				) : typeof Array.isArray(content()) ? (
					(content() as string[]).map((c) => <p class="text-2xl font-didact ">{c}</p>)
				) : (
					content()
				)}
				{cancelButton ? (
					<div class="grid grid-cols-2 gap-x-4">
						{typeof okButton === "string" ? (
							<button class="text-2xl shadow-lg shadow-gray-400 rounded-lg transition-colors duration-300 bg-green-300 hover:bg-green-400 focus:bg-green-400">
								{okButton}
							</button>
						) : (
							okButton
						)}
						{cancelButton ? (
							typeof cancelButton === "string" ? (
								<button class="text-2xl shadow-lg shadow-gray-400 rounded-lg transition-colors duration-300 bg-red-300 hover:bg-red-400 focus:bg-red-400">
									{cancelButton}
								</button>
							) : (
								cancelButton
							)
						) : null}
					</div>
				) : typeof okButton === "string" ? (
					<button
						onClick={() => popup?.dispatchEvent(new CustomEvent("hide"))}
						class="px-8 py-2 text-2xl shadow-lg shadow-gray-400 rounded-lg transition-colors duration-300 bg-green-300 hover:bg-green-400 focus:bg-green-400">
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
			}`}
			</style>
		</div>
	);
}
