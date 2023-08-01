import { Accessor, Show, batch, createEffect, createMemo, createSignal, on } from "solid-js";
import Modal from "./Modal.solid";
import type { Props as InputProps } from "../../Input.solid";
import { createStore } from "solid-js/store";

export type Action = {
	inputs: Record<string, InputProps>;
	onMount: () => void;
	onCleanup: () => void;
	type: ActionEnum;
	submitText: string;
	headerText: string;
};

type Props = {
	onAdd?: Accessor<Action | undefined>;
	onEdit?: Accessor<Action | undefined>;
	onDelete?: Accessor<Action | undefined>;
	pressedAction: Accessor<ActionEnum>;
	prefix: string;
	complete?: boolean;
};

export const enum ActionEnum {
	ADD = "add",
	EDIT = "edit",
	DELETE = "delete",
	NONE = ""
}

export default function TableControls(props: Props) {
	const { onAdd, onEdit, onDelete, pressedAction, prefix, complete } = props;
	const [open, setOpen] = createSignal(false, { equals: false });
	const [cleanup, setCleanup] = createSignal(() => {}, { equals: false });
	const [store, setStore] = createStore<{ inputs: [Record<string, InputProps>] }>({ inputs: [{}] });
	const [submitText, setSubmitText] = createSignal("", { equals: false });
	const [headerText, setHeaderText] = createSignal("", { equals: false });

	createEffect(
		on(pressedAction, action => {
			if (action === ActionEnum.NONE) return;
			batch(() => {
				cleanup()();
				setOpen(false);
			});
		})
	);

	const batchUpdate = (action: Action | undefined) =>
		batch(() => {
			if (!action) return;
			setOpen(true);
			setStore("inputs", [action.inputs]);
			setSubmitText(action.submitText);
			setHeaderText(action.headerText);
			setCleanup(prev => action.onCleanup);
			action.onMount();
		});
	const onAddClick = createMemo(() => {
		const action = onAdd?.call([]);
		return () => batchUpdate(action);
	});

	const onEditClick = createMemo(() => {
		const action = onEdit?.call([]);
		return () => batchUpdate(action);
	});

	const onDeleteClick = createMemo(() => {
		const action = onDelete?.call([]);
		return () => batchUpdate(action);
	});

	const modalProps = createMemo(() => {
		return {
			open: open(),
			inputs: store.inputs[0],
			submitText: submitText(),
			headerText: headerText(),
			close: () => {
				batch(() => {
					setOpen(false);
					cleanup()();
					setStore(prev => ({}));
				});
			}
		};
	});
	return (
		<>
			<div
				data-prefix={prefix}
				class="controlsContainer w-max place-self-center h-min grid auto-cols-auto grid-flow-col items-center shadow-md shadow-gray-500 rounded-xl bg-transparent"
			>
				{/*----------------------ADD BUTTON-------------------- */}
				<Show when={onAdd && onAdd?.call([]) !== undefined}>
					<button
						class="controlBtn py-2 px-4 hover:shadow-gray-600 hover:bg-red-200 first:rounded-l-xl last:rounded-r-xl"
						onClick={onAddClick()}
					>
						{prefix === "wholesalers" ? (
							<i class="fa-solid fa-user-plus"></i>
						) : prefix === "classtype" ? (
							<i class="fa-solid fa-square-plus"></i>
						) : (
							<i class="fa-solid fa-plus"></i>
						)}
					</button>
				</Show>
				{/*---------------------EDIT BUTTON-------------------- */}
				<Show when={!["wholesalers", "classtype", "sysusers"].includes(prefix)}>
					<Show
						when={onEdit && onEdit?.call([]) !== undefined}
						fallback={
							<button class="controlBtn py-2 px-4 text-neutral-500 blur-[1px] first:rounded-l-xl last:rounded-r-xl" disabled>
								<i class="fa-regular fa-pen-to-square"></i>
							</button>
						}
					>
						<button
							class="controlBtn py-2 px-4 hover:shadow-gray-600 hover:bg-red-200 first:rounded-l-xl last:rounded-r-xl"
							onClick={onEditClick()}
						>
							<i class="fa-regular fa-pen-to-square"></i>
						</button>
					</Show>
				</Show>
				{/*---------------------DELETE BUTTON-------------------- */}
				<Show
					when={onDelete && onDelete?.call([]) !== undefined}
					fallback={
						<button
							class="controlBtn py-2 px-4 text-neutral-500 blur-[1px] first:rounded-l-xl last-of-type:rounded-r-xl"
							disabled
						>
							<Show when={!complete} fallback={<i class="fa-solid fa-check"></i>}>
								<i class="fa-regular fa-trash-can"></i>
							</Show>
						</button>
					}
				>
					<button
						class="controlBtn py-2 px-4 hover:shadow-gray-600 hover:bg-red-200 last-of-type:rounded-r-xl"
						onClick={onDeleteClick()}
					>
						{prefix === "classtype" ? (
							<i class="fa-solid fa-square-minus"></i>
						) : prefix === "wholesalers" ? (
							<i class="fa-solid fa-user-minus"></i>
						) : complete ? (
							<i class="fa-solid fa-check"></i>
						) : (
							<i class="fa-regular fa-trash-can"></i>
						)}
					</button>
				</Show>
				<Modal {...modalProps()}></Modal>
			</div>
		</>
	);
}
