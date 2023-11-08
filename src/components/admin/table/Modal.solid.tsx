import { createSignal, For, Show, batch } from "solid-js";
import type { Props as InputProps } from "../../input/Input.solid";
import Input from "../../input/Input.solid";
import { CloseButton } from "./CloseButton.solid";
import Spinner from "../../other/Spinner.solid";
import { createStore } from "solid-js/store";
import type { ActionEnum } from "./TableControlTypes";

type Props = {
	inputs: Record<string, Partial<InputProps>>;
	onSubmit: (form: HTMLFormElement) => Promise<void>;
	submitText: string;
	headerText: string;
	prefix: string;
	type: ActionEnum;
};

const [loading, setLoading] = createStore<Record<string, boolean>>({});
const [open, setOpen] = createStore<Record<string, boolean>>({});

export const useModalOpen = (prefix?: string) => {
	const [modalOpen, setModalOpen] = createSignal(
		(prefix && open[prefix]) || false
	);

	const openModal = batch(() => (prefix: string) => {
		setModalOpen(true);
		setOpen((prev) => ({ ...prev, [prefix]: true }));
	});

	const closeModal = batch(() => (prefix: string) => {
		setModalOpen(false);
		setOpen((prev) => ({ ...prev, [prefix]: false }));
	});

	return [modalOpen, openModal, closeModal] as const;
};

export const useModalLoading = (prefix?: string) => {
	// @ts-ignore
	const [modalLoading, setModalLoading] = createSignal(
		(prefix && open[prefix]) || false
	);

	const startLoading = (prefix: string) => {
		setModalLoading(true);
		setLoading((prev) => ({ ...prev, [prefix]: true }));
	};

	const stopLoading = (prefix: string) => {
		setModalLoading(false);
		setLoading((prev) => ({ ...prev, [prefix]: false }));
	};

	return [modalLoading, startLoading, stopLoading] as const;
};

const submitWrapper = (
	onSubmit: Props["onSubmit"],
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
			await onSubmit(form);
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
	const { prefix, headerText, submitText, inputs, onSubmit, type } = props;
	const uniquePrefix = prefix + type;
	const [isOpen, openModal, closeModal] = useModalOpen();
	const [loading, startLoading, stopLoading] = useModalLoading();

	const onFormSubmit = async (event: Event) => {
		if (!onSubmit) return;
		event.preventDefault();
		event.stopPropagation();
		const form = document.querySelector<HTMLFormElement>(
			`form[data-prefix=${uniquePrefix}]`
		);
		if (!form) return;
		await submitWrapper(onSubmit, {
			setModalLoading: (set: boolean) => {
				if (set) startLoading(uniquePrefix);
				else stopLoading(uniquePrefix);
			},
			setModalOpen: (set: boolean) => {
				if (set) openModal(uniquePrefix);
				else closeModal(uniquePrefix);
			},
		})(form, event);
	};

	const onClose = () => {
		stopLoading(uniquePrefix);
		closeModal(uniquePrefix);
	};

	return (
		<div
			class={
				"modal fixed z-[5000] inset-0 w-full h-full bg-[rgb(120_120_120_/_0.2)] grid drop-shadow-[-1px_1px_2px_rgba(0,0,0,0.25)]" +
				(!open[uniquePrefix] ? " hidden" : "")
			}
		>
			<div class="relative max-w-[70%] max-sm:max-w-[92.5%] h-max max-h-[90vh] max-sm:max-h-[80dvh] max-sm:mt-[86px] p-6 bg-white place-self-center grid grid-rows-[max-content_1fr_max-content] shadow-lg shadow-gray-700 rounded-md gap-y-4 justify-center">
				<p class="text-4xl p-2 w-full text-center max-sm:text-3xl">
					{headerText}
				</p>
				<form
					data-prefix={uniquePrefix}
					class="peer/form group/form grid grid-cols-3 auto-rows-max gap-10 py-4 overflow-y-auto max-sm:grid-cols-1"
				>
					<For each={Object.values(inputs)}>
						{(input) => (
							<Show when={input.name !== ""}>
								<Input {...(input as InputProps)}></Input>
							</Show>
						)}
					</For>
				</form>
				<Show
					when={!loading()}
					fallback={<Spinner classes="max-sm:h-[100svh]" />}
				>
					<button
						class={
							"col-span-full w-min place-self-center text-[1.75rem] p-2 px-6 shadow-lg shadow-gray-400 rounded-lg transition-colors bg-green-300 hover:bg-green-500 focus:bg-green-500 peer-[:is(.animate-shake)]/form:bg-red-500" +
							" max-sm:text-2xl"
						}
						type="submit"
						onclick={onFormSubmit}
					>
						{submitText}
					</button>
				</Show>
				<CloseButton
					classes="absolute top-4 right-4 w-[1.5rem] h-[1.5rem] text-xl max-sm:w-8 max-sm:h-8 max-sm:text-lg"
					onClick={onClose}
				></CloseButton>
			</div>
		</div>
	);
}
