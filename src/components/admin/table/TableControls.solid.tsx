import type { ExtendedFormData } from "@utilities/forms";
import { Show, createEffect, type Accessor, type JSX } from "solid-js";
import { createStore } from "solid-js/store";
import type { InputFields, Props as InputProps } from "../../input/Input.solid";
import Modal, { setGlobalOpen } from "./Modal.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./TableControlTypes";
import Icon from "@components/other/Icon.solid";

export type Action = {
	inputs: InputFields<Record<string, InputProps>> | Record<string, InputProps>;
	onSubmit:
		| ((formData: ExtendedFormData<any>, form?: HTMLFormElement) => Promise<void>)
		| ((formData: ExtendedFormData<any>, form?: HTMLFormElement) => AsyncGenerator<undefined, void, unknown>);
	submitText: string;
	headerText: string;
	/** Read-only lines shown above the inputs, e.g. what a delete will remove. */
	summary?: string[];
	icon: ActionIcon;
	type: ActionEnum;
	/** Accessible name of the icon-only button. Defaults to a label derived from `type`. */
	label?: string;
};

const ACTION_LABELS: Record<ActionEnum, string> = {
	[ActionEnum.ADD]: "Προσθήκη",
	[ActionEnum.MODIFY]: "Επεξεργασία",
	[ActionEnum.DELETE]: "Διαγραφή",
	[ActionEnum.CHECK]: "Έλεγχος",
	[ActionEnum.DOWNLOAD_PDF]: "Λήψη PDF",
	[ActionEnum.DOWNLOAD_EXCEL]: "Λήψη Excel",
	[ActionEnum.PRINT]: "Εκτύπωση",
	[ActionEnum.NONE]: "Ενέργεια",
};

export const actionLabel = (action: Action | EmptyAction) =>
	("label" in action && action.label) || ACTION_LABELS[action.type] || ACTION_LABELS[ActionEnum.NONE];

type Props = {
	action: Accessor<Action | EmptyAction>;
	prefix: string;
};

const onActionClick = (prefix: string) => setGlobalOpen(prefix, true);

export function TableControl(props: Props) {
	const { prefix } = props;
	const [tableAction, setTableAction] = createStore<{ action: Action | EmptyAction }>({
		action: props.action() || {},
	});

	createEffect(() => {
		if (props.action) {
			setTableAction({ action: props.action() });
		}
	});

	return (
		<Show
			when={tableAction.action && "inputs" in tableAction.action && tableAction.action.inputs}
			fallback={
				<button
					type="button"
					disabled
					aria-disabled="true"
					aria-label={actionLabel(tableAction.action)}
					title={actionLabel(tableAction.action)}
					class={"controlBtn py-2 px-4 first-of-type:rounded-l-xl last-of-type:rounded-r-xl text-ink-muted opacity-35 cursor-not-allowed"}>
					<Icon name={tableAction.action.icon || ActionIcon.ADD} class="text-lg max-sm:text-base" />
				</button>
			}>
			<>
				<button
					type="button"
					aria-label={actionLabel(tableAction.action)}
					title={actionLabel(tableAction.action)}
					class={
						"group/ctrlBtn controlBtn py-2 px-4 first-of-type:rounded-l-xl last-of-type:rounded-r-xl text-accent-ink transition-colors duration-200 hover:bg-accent-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink"
					}
					onclick={() => onActionClick(prefix + tableAction.action.type)}>
					<Icon
						name={tableAction.action.icon || ActionIcon.ADD}
						style={{ "backface-visibility": "hidden" }}
						class="text-lg max-sm:text-base will-change-transform transition-transform duration-150 ease-[cubic-bezier(0,.85,.43,.64)] group-hover/ctrlBtn:scale-[1.096] origin-center"
					/>
				</button>
				<Modal prefix={prefix} actionStore={tableAction as { action: Action }} />
			</>
		</Show>
	);
}

export function TableControlsGroup(props: { prefix: string; children: Element | JSX.Element }) {
	return (
		<div
			data-prefix={props.prefix}
			class="w-max place-self-center h-min grid auto-cols-auto grid-flow-col items-center divide-x divide-line rounded-xl border border-line bg-surface text-ink shadow-sm shadow-shade">
			{props.children}
		</div>
	);
}

export function TopTableGroup(props: { children: Element | JSX.Element }) {
	return (
		<div style={{ "grid-area": "top_tools" }} class="flex flex-row flex-wrap max-sm:gap-y-4 w-full justify-evenly z-1001">
			{props.children}
		</div>
	);
}

export function BottomTableGroup(props: { children: Element | JSX.Element }) {
	return (
		<div style={{ "grid-area": "bottom_tools" }} class="flex flex-row flex-wrap max-sm:gap-y-4 w-full justify-evenly z-1000">
			{props.children}
		</div>
	);
}

export function LeftTableGroup(props: { children?: Element | JSX.Element }) {
	return (
		<div style={{ "grid-area": "left_tools" }} class="flex flex-col justify-self-center self-center translate-y-[-50%] items-center w-full gap-y-12 z-1000">
			{props.children}
		</div>
	);
}
