import { ExtendedFormData } from "@utilities/forms";
import { isAsyncGeneratorFunction } from "@utilities/functionValidation";
import { For, Show, batch, createEffect, createSignal, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import type { Props as InputProps } from "../../input/Input.solid";
import Input from "../../input/Input.solid";
import Dialog, { DialogCloseButton } from "../../other/Dialog.solid";
import Icon from "@components/other/Icon.solid";
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

	const isDelete = () => actionStore.action.type === ActionEnum.DELETE;
	const hasInputs = () => Object.values(actionStore.action.inputs).some((input) => !!input.name && input.type !== "hidden");

	return (
		<Dialog
			open={openState()}
			onClose={onClose}
			labelledBy={TITLE_ID}
			beforeEscape={canDismiss}
			closeOnBackdrop={canDismiss}
			backdropClass="modal fixed z-[5000] inset-0 w-full h-full bg-[rgb(120_120_120_/_0.35)] dark:bg-[rgb(0_0_0_/_0.6)] grid backdrop-blur-sm p-4 max-sm:p-2"
			class={
				"relative place-self-center grid grid-rows-[max-content_1fr_max-content] max-h-[min(92dvh,60rem)] max-sm:max-h-[calc(100dvh-6rem)] max-sm:mt-20 overflow-hidden bg-surface text-ink border border-line shadow-2xl shadow-black/30 rounded-2xl focus-visible:outline-hidden " +
				(hasInputs() ? "w-[min(70rem,94vw)]" : "w-[min(32rem,94vw)]")
			}>
			<header class="flex items-center gap-x-3 border-b border-line px-6 py-4 max-sm:px-4 max-sm:py-3">
				<span
					class={
						"grid size-10 shrink-0 place-items-center rounded-xl text-lg max-sm:size-9 " +
						(isDelete() ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-accent-soft text-accent-ink")
					}>
					<Icon name={actionStore.action.icon} />
				</span>
				<h2 id={TITLE_ID} class="min-w-0 flex-1 font-anaktoria text-3xl leading-tight max-sm:text-2xl">
					{actionStore.action.headerText}
				</h2>
				<DialogCloseButton class="size-9 shrink-0 text-lg" onClick={() => canDismiss() && onClose()} />
			</header>
			<div class="min-h-0 overflow-y-auto overscroll-contain">
				<Show when={actionStore.action.summary?.length}>
					<ul class="mx-6 mt-5 max-h-[40vh] overflow-y-auto rounded-lg border border-line bg-surface-muted px-5 py-3 text-base list-disc list-inside max-sm:mx-4">
						<For each={actionStore.action.summary}>{(line) => <li class="py-0.5">{line}</li>}</For>
					</ul>
				</Show>
				<Show when={isDelete() && !hasInputs()}>
					<p class="px-6 pt-5 pb-1 text-base text-ink-muted max-sm:px-4">Η ενέργεια δεν αναιρείται.</p>
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
					class={
						"modal-form group/form grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-x-6 gap-y-7 " +
						(hasInputs() ? "px-6 pt-8 pb-6 max-sm:px-3 max-sm:pt-6" : "p-0")
					}>
					<Show when={Object.entries(actionStore.action.inputs).length > 0}>
						<For each={Object.values(actionStore.action.inputs).filter((input) => !!input.name)}>
							{(inputProps) => {
								return <Input {...(inputProps as InputProps)} prefix={MODAL_PREFIX}></Input>;
							}}
						</For>
					</Show>
				</form>
			</div>
			<footer class="flex items-center justify-end gap-3 border-t border-line bg-surface-muted px-6 py-3.5 max-sm:px-4">
				<button
					type="button"
					onClick={() => canDismiss() && onClose()}
					disabled={loading()}
					class="rounded-lg px-4 py-2 text-lg text-ink-muted transition-colors hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-ink disabled:opacity-50">
					Ακύρωση
				</button>
				{/* Outside the scrolling <form> for layout, but owned by it via `form=` — so Enter in a field submits. */}
				<button
					class={
						"inline-flex min-w-36 items-center justify-center gap-2 rounded-lg px-6 py-2 text-lg font-semibold shadow-md shadow-shade transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:cursor-wait disabled:opacity-80 " +
						// Destructive actions get a red button, everything else the brand colour.
						(isDelete() ? "bg-red-700 text-white hover:bg-red-800" : "bg-brand text-brand-ink hover:bg-brand-hover")
					}
					type="submit"
					form={FORM_ID}
					disabled={loading()}
					aria-busy={loading()}>
					<Show when={loading()} fallback={<Icon name={isDelete() ? "trash" : "check"} />}>
						<Icon name="spinner" spin />
					</Show>
					{actionStore.action.submitText}
				</button>
			</footer>
		</Dialog>
	);
}
