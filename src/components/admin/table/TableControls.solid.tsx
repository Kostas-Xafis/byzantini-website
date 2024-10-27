import { Show, createEffect, type Accessor, type JSX } from "solid-js";
import { createStore } from "solid-js/store";
import type { InputFields, Props as InputProps } from "../../input/Input.solid";
import Modal, { setGlobalOpen } from "./Modal.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./TableControlTypes";

export type Action = {
	inputs: InputFields<Record<string, InputProps>> | Record<string, InputProps>;
	onSubmit:
		| ((formData: FormData, form?: HTMLFormElement) => Promise<void>)
		| ((
				formData: FormData,
				form?: HTMLFormElement
		  ) => AsyncGenerator<undefined, void, unknown>);
	submitText: string;
	headerText: string;
	icon: ActionIcon;
	type: ActionEnum;
};

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
					class={
						"controlBtn py-2 px-4 first-of-type:rounded-l-xl last-of-type:rounded-r-xl text-neutral-500 blur-[1px]"
					}>
					<i
						class={
							"text-lg max-sm:text-base " +
							(tableAction.action.icon || ActionIcon.ADD)
						}></i>
				</button>
			}>
			<>
				<button
					class={
						"group/ctrlBtn controlBtn py-2 px-4 first-of-type:rounded-l-xl last-of-type:rounded-r-xl transition-colors duration-300 hover:bg-red-200"
					}
					onclick={() => onActionClick(prefix + tableAction.action.type)}>
					<i
						style={{ "backface-visibility": "hidden" }}
						class={
							"text-lg max-sm:text-base will-change-transform transition-transform duration-150 ease-[cubic-bezier(0,.85,.43,.64)] group-hover/ctrlBtn:scale-[1.096] origin-center " +
							(tableAction.action.icon || ActionIcon.ADD)
						}></i>
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
			class="w-max place-self-center h-min grid auto-cols-auto grid-flow-col items-center shadow-md shadow-gray-500 rounded-xl bg-transparent">
			{props.children}
		</div>
	);
}

export function TopTableGroup(props: { children: Element | JSX.Element }) {
	return (
		<div
			style={{ "grid-area": "top_tools" }}
			class="flex flex-row flex-wrap max-sm:gap-y-4 w-full justify-evenly z-[1001]">
			{props.children}
		</div>
	);
}

export function BottomTableGroup(props: { children: Element | JSX.Element }) {
	return (
		<div
			style={{ "grid-area": "bottom_tools" }}
			class="flex flex-row flex-wrap max-sm:gap-y-4 w-full justify-evenly z-[1000]">
			{props.children}
		</div>
	);
}

export function LeftTableGroup(props: { children?: Element | JSX.Element }) {
	return (
		<div
			style={{ "grid-area": "left_tools" }}
			class="flex flex-col justify-self-center self-center translate-y-[-50%] items-center w-full gap-y-12 z-[1000]">
			{props.children}
		</div>
	);
}
