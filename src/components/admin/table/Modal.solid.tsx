import { ExtendedFormData } from "@utilities/forms";
import { isAsyncGeneratorFunction } from "@utilities/functionValidation";
import { For, Show, batch, createEffect, createSignal, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import type { Props as InputProps } from "../../input/Input.solid";
import Input from "../../input/Input.solid";
import Dialog, { DialogCloseButton } from "../../other/Dialog.solid";
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

	const danger = () => actionStore.action.type === ActionEnum.DELETE;

	return (
		<Dialog
			open={openState()}
			onClose={onClose}
			labelledBy={TITLE_ID}
			beforeEscape={canDismiss}
			closeOnBackdrop={canDismiss}
			backdropClass="modal fixed z-[5000] inset-0 grid h-full w-full bg-black/35 p-4 backdrop-blur-[3px] dark:bg-black/60"
			class="relative flex h-max max-h-[90vh] w-max min-w-[min(520px,92vw)] max-w-[min(1100px,94vw)] flex-col place-self-center overflow-hidden rounded-2xl bg-white text-red-950 shadow-2xl shadow-black/25 ring-1 ring-black/5 focus-visible:outline-hidden max-sm:mt-[86px] max-sm:max-h-[80dvh] dark:bg-dark dark:text-red-50 dark:shadow-black/60 dark:ring-white/10">
			<header class="flex items-center gap-x-3 border-b border-gray-200 px-6 py-4 max-sm:px-4 dark:border-neutral-700/70">
				<span
					class={
						"grid size-10 shrink-0 place-items-center rounded-xl text-lg " +
						(danger()
							? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
							: "bg-red-50 text-red-900 dark:bg-red-900/25 dark:text-red-200")
					}
					aria-hidden="true">
					<i class={actionStore.action.icon}></i>
				</span>
				<h2 id={TITLE_ID} class="min-w-0 flex-1 font-anaktoria text-3xl leading-tight max-sm:text-2xl">
					{actionStore.action.headerText}
				</h2>
				<DialogCloseButton class="size-9 shrink-0 text-lg" onClick={onClose} />
			</header>
			<div class="grid min-h-0 flex-1 gap-y-6 overflow-y-auto px-6 pt-6 pb-4 max-sm:px-4">
				<Show when={actionStore.action.summary?.length}>
					<div
						class={
							"flex gap-x-3 rounded-xl border px-4 py-3 text-base " +
							(danger()
								? "border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-50"
								: "border-gray-200 bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800/50")
						}>
						<Show when={danger()}>
							<i class="fa-solid fa-triangle-exclamation mt-1 text-red-700 dark:text-red-300" aria-hidden="true"></i>
						</Show>
						<ul class="grid max-h-[40vh] gap-y-1 overflow-y-auto">
							<For each={actionStore.action.summary}>{(line, index) => <li class={index() === 0 ? "font-semibold" : ""}>{line}</li>}</For>
						</ul>
					</div>
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
						"group/form grid grid-cols-3 auto-rows-max gap-x-6 gap-y-8 pt-2 max-sm:grid-cols-1" +
						(Object.keys(actionStore.action.inputs).length === 0 ? " hidden" : "")
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
			<footer class="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 max-sm:px-4 dark:border-neutral-700/70">
				<button
					type="button"
					disabled={loading()}
					onClick={() => canDismiss() && onClose()}
					class="rounded-xl border border-gray-300 px-5 py-2 text-lg transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800">
					Άκυρο
				</button>
				{/* Outside the scrolling <form> for layout, but owned by it via `form=` — so Enter in a field submits. */}
				<button
					class={
						"inline-flex items-center gap-x-2 rounded-xl px-5 py-2 text-lg font-semibold text-white shadow-sm transition-colors disabled:cursor-wait disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 " +
						// Destructive actions get a red button, everything else stays green.
						(danger()
							? "bg-red-700 hover:bg-red-800 focus-visible:outline-red-700"
							: "bg-emerald-700 hover:bg-emerald-800 focus-visible:outline-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500")
					}
					type="submit"
					form={FORM_ID}
					disabled={loading()}
					aria-busy={loading() ? "true" : "false"}>
					<Show when={loading()}>
						<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
					</Show>
					{actionStore.action.submitText}
				</button>
			</footer>
		</Dialog>
	);
}
