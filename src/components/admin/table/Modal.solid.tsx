import { ExtendedFormData } from "@utilities/forms";
import { isAsyncGeneratorFunction } from "@utilities/functionValidation";
import { For, Show, batch, createEffect, createSignal, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import type { Props as InputProps } from "../../input/Input.solid";
import Input from "../../input/Input.solid";
import Dialog, { DialogCloseButton } from "../../other/Dialog.solid";
import Spinner from "../../other/Spinner.solid";
import { createAlert, pushAlert } from "../Alert.solid";
import { ActionEnum } from "./TableControlTypes";
import type { Action } from "./TableControls.solid";

type Props = {
	prefix: string;
	actionStore: { action: Action };
};

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

const submitWrapper = (
	onSubmit: ((formData: FormData, form?: HTMLFormElement | undefined) => Promise<void>) | AsyncGenerator<undefined, void, unknown>,
	setModalOpen: (set: boolean) => void,
) => {
	return async function (form: HTMLFormElement) {
		try {
			if ("next" in onSubmit) {
				const res = await onSubmit.next();
				if (!res.done) return;
			} else {
				await onSubmit(new ExtendedFormData(form), form);
			}
			setModalOpen(false);
		} catch (error: any) {
			console.error(error);
			pushAlert(createAlert("error", "Σφάλμα: ", error.message));
			form.classList.add("animate-shake");
			setTimeout(() => form.classList.remove("animate-shake"), 500);
		}
	};
};

export default function Modal(props: Props) {
	const { prefix, actionStore } = props;
	const MODAL_PREFIX = prefix + actionStore.action.type;
	const FORM_ID = `modal-form-${MODAL_PREFIX}`;
	const TITLE_ID = `modal-title-${MODAL_PREFIX}`;
	const [openState, setOpenState] = useModalOpen(MODAL_PREFIX);
	const [loading, setLoading] = createSignal(false);
	// Set once the user edits any field — a dirty form is not dismissed by a stray backdrop click / Esc without confirmation.
	const [dirty, setDirty] = createSignal(false);
	createEffect(() => openState() || setDirty(false));

	const onFormSubmit = async (event: SubmitEvent) => {
		event.preventDefault();
		event.stopPropagation();
		if (loading()) return;
		const form = event.currentTarget as HTMLFormElement;

		const { onSubmit } = actionStore.action;
		const openModal = (set: boolean) => setOpenState(MODAL_PREFIX, set);
		try {
			setLoading(true);
			if (isAsyncGeneratorFunction(onSubmit)) {
				const genFunc = onSubmit(new ExtendedFormData(form), form) as AsyncGenerator<undefined, void, void>;
				await submitWrapper(genFunc, openModal)(form);
			} else {
				// @ts-ignore
				await submitWrapper(onSubmit, openModal)(form);
			}
		} finally {
			setLoading(false);
		}
	};

	const onClose = () => {
		setOpenState(MODAL_PREFIX, false);
		document.dispatchEvent(new CustomEvent("modal_close", { detail: { prefix: MODAL_PREFIX } }));
	};

	// Esc / backdrop click: close straight away when nothing was typed, otherwise ask first.
	const canDismiss = () => !loading() && (!dirty() || window.confirm("Οι αλλαγές δεν έχουν αποθηκευτεί. Να κλείσει το παράθυρο;"));

	return (
		<Dialog
			open={openState()}
			onClose={onClose}
			labelledBy={TITLE_ID}
			beforeEscape={canDismiss}
			closeOnBackdrop={canDismiss}
			backdropClass="modal fixed z-[5000] inset-0 w-full h-full bg-[rgb(120_120_120_/_0.35)] dark:bg-[rgb(0_0_0_/_0.6)] grid drop-shadow-[-1px_1px_2px_rgba(0,0,0,0.25)] backdrop-blur-sm"
			class="relative max-w-[70%] max-sm:max-w-[92.5%] h-max max-h-[90vh] max-sm:max-h-[80dvh] max-sm:mt-[86px] p-6 bg-surface place-self-center grid grid-rows-[max-content_1fr_max-content] border border-line shadow-2xl shadow-black/30 rounded-2xl gap-y-4 justify-center text-ink focus-visible:outline-hidden">
			<h2 id={TITLE_ID} class="font-anaktoria text-4xl p-2 w-full text-center max-sm:text-3xl">
				{actionStore.action.headerText}
			</h2>
			<Show when={actionStore.action.summary?.length}>
				<ul class="max-h-[40vh] overflow-y-auto px-4 text-lg list-disc list-inside">
					<For each={actionStore.action.summary}>{(line) => <li>{line}</li>}</For>
				</ul>
			</Show>
			<form
				id={FORM_ID}
				data-prefix={MODAL_PREFIX}
				// Validation stays in the action handlers (as before); the browser's own constraint
				// validation would silently block submits on hidden required inputs.
				novalidate
				onSubmit={onFormSubmit}
				onInput={() => setDirty(true)}
				onChange={() => setDirty(true)}
				class="peer/form group/form grid grid-cols-3 auto-rows-max gap-10 py-4 overflow-y-auto max-sm:grid-cols-1">
				<Show when={Object.entries(actionStore.action.inputs).length > 0}>
					<For each={Object.values(actionStore.action.inputs).filter((input) => !!input.name)}>
						{(inputProps) => {
							return <Input {...(inputProps as InputProps)} prefix={MODAL_PREFIX}></Input>;
						}}
					</For>
				</Show>
			</form>
			<Show when={!loading()} fallback={<Spinner classes="max-sm:h-[100svh]"></Spinner>}>
				{/* Outside the scrolling <form> for layout, but owned by it via `form=` — so Enter in a field submits. */}
				<button
					class={
						"col-span-full w-min place-self-center text-[1.75rem] p-2 px-6 shadow-lg shadow-gray-400 dark:shadow-gray-700 rounded-lg transition-colors text-white peer-[:is(.animate-shake)]/form:bg-red-600 dark:peer-[:is(.animate-shake)]/form:bg-red-700" +
						// Destructive actions get a red button, everything else stays green.
						(actionStore.action.type === ActionEnum.DELETE
							? " bg-red-700 hover:bg-red-800 focus:bg-red-800"
							: " bg-green-500 hover:bg-green-600 focus:bg-green-600 dark:bg-green-600 dark:hover:bg-green-500 dark:focus:bg-green-500") +
						" max-sm:text-2xl"
					}
					type="submit"
					form={FORM_ID}>
					{actionStore.action.submitText}
				</button>
			</Show>
			<DialogCloseButton class="absolute top-4 right-4 w-[1.5rem] h-[1.5rem] text-xl max-sm:w-8 max-sm:h-8 max-sm:text-lg" onClick={onClose} />
		</Dialog>
	);
}
