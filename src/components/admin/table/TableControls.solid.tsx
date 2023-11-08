import { type Accessor } from "solid-js";
import Modal from "./Modal.solid";
import type { Props as InputProps } from "../../input/Input.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./TableControlTypes";
import { useModalOpen } from "./Modal.solid";

export type Action = {
	inputs: Record<string, InputProps>;
	onSubmit: (form: HTMLFormElement) => Promise<void>;
	submitText: string;
	headerText: string;
	icon: ActionIcon;
	type: ActionEnum;
};

type Props = {
	onActionsArray: Accessor<Action | EmptyAction>[];
	pressedAction?: Accessor<{ action: ActionEnum; mutate: number[] }>;
	prefix: string;
};
const [isModalOpen, openModal] = useModalOpen();

const onActionsArrayClick = (prefix: string, action: Action) => {
	openModal(prefix + action.type);
};

export default function TableControls(props: Props) {
	const { onActionsArray, prefix } = props;
	return (
		<>
			<div
				data-prefix={prefix}
				class="controlsContainer w-max place-self-center h-min grid auto-cols-auto grid-flow-col items-center shadow-md shadow-gray-500 rounded-xl bg-transparent"
			>
				{onActionsArray.map((actionAccessor) => {
					const action = actionAccessor();
					const active = !!("inputs" in action);
					const icon = action.icon;
					return (
						<>
							<button
								class={
									"controlBtn py-2 px-4 first-of-type:rounded-l-xl last-of-type:rounded-r-xl" +
									(active
										? " hover:shadow-gray-600 hover:bg-red-200"
										: " text-neutral-500 blur-[1px]")
								}
								onclick={() =>
									active &&
									onActionsArrayClick(prefix, action)
								}
							>
								<i
									class={
										"text-lg max-sm:text-base " +
										(icon || ActionIcon.ADD)
									}
								></i>
							</button>
							<Modal
								prefix={prefix}
								type={(action as Action).type}
								headerText={(action as Action).headerText || ""}
								submitText={(action as Action).submitText || ""}
								inputs={(action as Action).inputs || {}}
								onSubmit={
									(action as Action).onSubmit || undefined
								}
							></Modal>
						</>
					);
				})}
			</div>
		</>
	);
}
