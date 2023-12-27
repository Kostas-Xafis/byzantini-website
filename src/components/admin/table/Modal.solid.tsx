import { createSignal, For, Show, batch, createEffect, untrack } from "solid-js";
import type { Props as InputProps } from "../../input/Input.solid";
import Input from "../../input/Input.solid";
import { CloseButton } from "./CloseButton.solid";
import Spinner from "../../other/Spinner.solid";
import { createStore } from "solid-js/store";
import type { Action } from "./TableControls.solid";

type Props = {
	prefix: string;
	action: Action;
};

const [globalLoading, setGlobalLoading] = createStore<Record<string, boolean>>({});
export const [globalOpen, setGlobalOpen] = createStore<Record<string, boolean>>({});

export const useModalOpen = (prefix?: string) => {
	const [openState, setOpenState] = createSignal((prefix && globalOpen[prefix]) || false);

	prefix &&
		createEffect(() => {
			const localOpen = untrack(() => openState());
			if (globalOpen[prefix] !== localOpen) {
				setOpenState(globalOpen[prefix] || localOpen || false);
			}
		});

	const setModalOpen = batch(() => (prefix: string, set: boolean) => {
		setOpenState(set);
		setGlobalOpen((prev) => ({ ...prev, [prefix]: set }));
	});

	return [openState, setModalOpen] as const;
};

export const useModalLoading = (prefix?: string) => {
	// @ts-ignore
	const [loadingState, setLoadingState] = createSignal((prefix && globalOpen[prefix]) || false);

	const setModalLoading = batch(() => (prefix: string, set: boolean) => {
		setLoadingState(set);
		setGlobalLoading((prev) => ({ ...prev, [prefix]: set }));
	});
	return [loadingState, setModalLoading] as const;
};

const submitWrapper = (
	onSubmit: Props["action"]["onSubmit"],
	{
		setModalLoading,
		setModalOpen,
	}: {
		setModalLoading: (set: boolean) => void;
		setModalOpen: (set: boolean) => void;
	}
) => {
	return async function (form: HTMLFormElement, e: Event) {
		try {
			setModalLoading(true);
			await onSubmit(new FormData(form));
			setModalLoading(false);
			setModalOpen(false);
		} catch (error) {
			console.error(error);
			const form = document.querySelector(
				".modal:is(:not(.hidden)) > div > form"
			) as HTMLFormElement;
			setModalLoading(false);
			void form.report;
			form.classList.add("animate-shake");
			setTimeout(() => form.classList.remove("animate-shake"), 500);
		}
	};
};

export default function Modal(props: Props) {
	const { prefix, action } = props;
	const MODAL_PREFIX = prefix + action.type;
	const [openState, setOpenState] = useModalOpen(MODAL_PREFIX);
	const [loadingState, setLoadingState] = useModalLoading(MODAL_PREFIX);

	const onFormSubmit = async (event: Event) => {
		if (!action.onSubmit) return;
		event.preventDefault();
		event.stopPropagation();
		const form = document.querySelector<HTMLFormElement>(`form[data-prefix=${MODAL_PREFIX}]`);
		if (!form) return;
		await submitWrapper(action.onSubmit, {
			setModalLoading: (set: boolean) => {
				setLoadingState(MODAL_PREFIX, set);
			},
			setModalOpen: (set: boolean) => {
				setOpenState(MODAL_PREFIX, set);
			},
		})(form, event);
	};

	const onClose = () => {
		setLoadingState(MODAL_PREFIX, false);
		setOpenState(MODAL_PREFIX, false);
		document.dispatchEvent(new CustomEvent("ModalClose", { detail: { prefix: MODAL_PREFIX } }));
	};

	return (
		<div
			class={
				"modal fixed z-[5000] inset-0 w-full h-full bg-[rgb(120_120_120_/_0.35)] grid drop-shadow-[-1px_1px_2px_rgba(0,0,0,0.25)] backdrop-blur-sm" +
				(!globalOpen[MODAL_PREFIX] ? " hidden" : "")
			}>
			<div class="relative max-w-[70%] max-sm:max-w-[92.5%] h-max max-h-[90vh] max-sm:max-h-[80dvh] max-sm:mt-[86px] p-6 bg-white place-self-center grid grid-rows-[max-content_1fr_max-content] shadow-lg shadow-gray-700 rounded-md gap-y-4 justify-center">
				<p class="text-4xl p-2 w-full text-center max-sm:text-3xl">{action.headerText}</p>
				<form
					data-prefix={MODAL_PREFIX}
					class="peer/form group/form grid grid-cols-3 auto-rows-max gap-10 py-4 overflow-y-auto max-sm:grid-cols-1">
					<For each={Object.values(action.inputs).filter((input) => !!input.name)}>
						{(input) => (
							<Input {...(input as InputProps)} prefix={MODAL_PREFIX}></Input>
						)}
					</For>
				</form>
				<Show when={!loadingState()} fallback={<Spinner classes="max-sm:h-[100svh]" />}>
					<button
						class={
							"col-span-full w-min place-self-center text-[1.75rem] p-2 px-6 shadow-lg shadow-gray-400 rounded-lg transition-colors bg-green-300 hover:bg-green-500 focus:bg-green-500 peer-[:is(.animate-shake)]/form:bg-red-500" +
							" max-sm:text-2xl"
						}
						type="submit"
						onclick={onFormSubmit}>
						{action.submitText}
					</button>
				</Show>
				<CloseButton
					classes="absolute top-4 right-4 w-[1.5rem] h-[1.5rem] text-xl max-sm:w-8 max-sm:h-8 max-sm:text-lg"
					onClick={onClose}></CloseButton>
			</div>
		</div>
	);
}
