import {
	type Accessor,
	Show,
	batch,
	createEffect,
	createMemo,
	createSignal,
	on,
	For,
} from "solid-js";
import Modal from "./Modal.solid";
import type { Props as InputProps } from "../../input/Input.solid";
import { createStore } from "solid-js/store";

export const enum ActionEnum {
	ADD = "ADD",
	MODIFY = "MODIFY",
	DELETE = "DELETE",
	CHECK = "CHECK",
	DOWNLOAD = "DOWNLOAD",
	NONE = "",
}

export const enum ActionIcon {
	ADD = "fa-solid fa-plus",
	MODIFY = "fa-regular fa-pen-to-square",
	DELETE = "fa-regular fa-trash-can",
	CHECK = "fa-solid fa-check",
	ADD_USER = "fa-solid fa-user-plus",
	DELETE_USER = "fa-solid fa-user-minus",
	ADD_BOX = "fa-regular fa-square-plus",
	DELETE_BOX = "fa-regular fa-square-minus",
	DOWNLOAD_SINGLE = "fa-solid fa-download",
	DOWNLOAD_ZIP = "fa-regular fa-file-zipper",
	DOWNLOAD_EXCEL = "fa-solid fa-table",
}

export type Action = {
	inputs: Record<string, InputProps>;
	onMount: () => void;
	onCleanup: () => void;
	submitText: string;
	headerText: string;
	icon: ActionIcon;
};

export type EmptyAction = {
	icon: ActionIcon;
};

type Props = {
	onActionsArray: Accessor<Action | EmptyAction>[];
	pressedAction: Accessor<{ action: ActionEnum; mutate: number[] }>;
	prefix: string;
};

export default function TableControls(props: Props) {
	const { onActionsArray, pressedAction, prefix } = props;
	const [open, setOpen] = createSignal(false, { equals: false });
	const [cleanup, setCleanup] = createSignal(() => {}, { equals: false });
	const [inputs, setInputs] = createStore<{
		inputs: [Record<string, InputProps>];
	}>({ inputs: [{}] });
	const [submitText, setSubmitText] = createSignal("", { equals: false });
	const [headerText, setHeaderText] = createSignal("", { equals: false });

	createEffect(
		on(pressedAction, ({ action }) => {
			if (action === ActionEnum.NONE) return;
			batch(() => {
				cleanup()();
				setOpen(false);
			});
		})
	);

	const batchUpdate = (action: Action | EmptyAction) => {
		if (!action || Object.values(action).length === 1) return;
		batch(() => {
			let a = action as Action;
			setOpen(true);
			setInputs("inputs", [a.inputs]);
			setSubmitText(a.submitText);
			setHeaderText(a.headerText);
			setCleanup((prev) => a.onCleanup);
			a.onMount();
		});
	};
	const onActionsArrayClick = (action: Action | EmptyAction) =>
		batchUpdate(action);

	const modalProps = createMemo(() => {
		return {
			open: open(),
			inputs: inputs.inputs[0],
			submitText: submitText(),
			headerText: headerText(),
			prefix,
			close: () => {
				batch(() => {
					setOpen(false);
					cleanup()();
					setInputs((prev) => ({}));
				});
			},
		};
	});
	const actionsArrayMemo = createMemo(() => {
		const actions = onActionsArray;
		return actions.map((accessor) => {
			const a = accessor();
			return {
				active: !!("inputs" in a),
				icon: a.icon,
				action: a,
			};
		});
	});
	return (
		<>
			<div
				data-prefix={prefix}
				class="controlsContainer w-max place-self-center h-min grid auto-cols-auto grid-flow-col items-center shadow-md shadow-gray-500 rounded-xl bg-transparent"
			>
				<For each={actionsArrayMemo()}>
					{(action) => {
						return (
							<Show
								when={action.active}
								fallback={
									<button class="controlBtn py-2 px-4 text-neutral-500 blur-[1px] first-of-type:rounded-l-xl last-of-type:rounded-r-xl">
										<i
											class={
												"text-lg max-sm:text-base " +
												(action?.icon || ActionIcon.ADD)
											}
										></i>
									</button>
								}
							>
								<button
									class="controlBtn py-2 px-4 hover:shadow-gray-600 hover:bg-red-200 first-of-type:rounded-l-xl last-of-type:rounded-r-xl"
									onClick={() =>
										onActionsArrayClick(action.action)
									}
								>
									<i
										class={
											"text-lg max-sm:text-base " +
											(action?.icon || ActionIcon.ADD)
										}
									></i>
								</button>
							</Show>
						);
					}}
				</For>
				<Modal {...modalProps()}></Modal>
			</div>
		</>
	);
}
