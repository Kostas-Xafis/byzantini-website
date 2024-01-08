import { Show, createEffect, createMemo, createSignal, type Accessor, type JSX } from "solid-js";
import type { Props as InputProps } from "../../input/Input.solid";
import Modal, { setGlobalOpen } from "./Modal.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./TableControlTypes";

export type Action = {
	inputs: Record<string, InputProps>;
	onSubmit: (formData: FormData) => Promise<void>;
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
	const [tableAction, setTableAction] = createSignal<Action | EmptyAction>(
		// @ts-ignore
		props.action() || {}
	);

	createEffect(() => {
		if (props.action) setTableAction(props.action() || {});
	});

	const action = createMemo(() => tableAction());

	return (
		<Show
			when={"inputs" in action()}
			fallback={
				<button
					class={
						"controlBtn py-2 px-4 first-of-type:rounded-l-xl last-of-type:rounded-r-xl text-neutral-500 blur-[1px]"
					}>
					<i class={"text-lg max-sm:text-base " + (action().icon || ActionIcon.ADD)}></i>
				</button>
			}>
			<>
				<button
					class={
						"group/ctrlBtn controlBtn py-2 px-4 first-of-type:rounded-l-xl last-of-type:rounded-r-xl transition-colors duration-300 hover:bg-red-200"
					}
					onclick={() => onActionClick(prefix + (action() as Action).type)}>
					<i
						style={{ "backface-visibility": "hidden" }}
						class={
							"text-lg max-sm:text-base will-change-transform transition-transform duration-150 ease-[cubic-bezier(0,.85,.43,.64)] group-hover/ctrlBtn:scale-[1.096] origin-center " +
							(action().icon || ActionIcon.ADD)
						}></i>
				</button>
				<Modal prefix={prefix} action={action() as Action} />
			</>
		</Show>
	);
}

export function TableControlsGroup(props: { prefix: string; children: Element | JSX.Element }) {
	return (
		<div
			data-prefix={props.prefix}
			class="controlsContainer w-max place-self-center h-min grid auto-cols-auto grid-flow-col items-center shadow-md shadow-gray-500 rounded-xl bg-transparent">
			{props.children}
		</div>
	);
}
