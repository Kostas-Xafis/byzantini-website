import { createEffect, createSignal, For, Show } from "solid-js";
import type { Props as InputProps } from "../../Input.solid";
import Input from "../../Input.solid";
import { CloseButton } from "./CloseButton.solid";

type Props = {
	open: boolean;
	inputs: Record<string, Partial<InputProps>>;
	close: () => void;
	submitText: string;
	headerText: string;
};

export default function Modal(props: Props) {
	const { close } = props;
	const [open, setOpen] = createSignal(props.open, { equals: false });
	const [inputs, setInputs] = createSignal(props.inputs);
	const [submitText, setSubmitText] = createSignal("");
	const [headerText, setHeaderText] = createSignal("");

	createEffect(() => {
		setOpen(props.open);
		setInputs(props.inputs);
		setSubmitText(props.submitText);
		setHeaderText(props.headerText);
	});

	return (
		<div
			class={
				"modal fixed z-[5000] inset-0 w-full h-full bg-[rgb(120_120_120_/_0.2)] grid drop-shadow-[-1px_1px_2px_rgba(0,0,0,0.25)]" +
				(!open() ? " hidden" : "")
			}
		>
			<div class="relative max-w-[70%] h-[95vh] overflow-y-auto p-12 bg-white place-self-center grid grid-rows-[auto_min-content] shadow-lg shadow-gray-700 rounded-md gap-y-12 justify-center">
				<p class="text-4xl p-2 w-full text-center">{headerText()}</p>
				<form class="group/form grid grid-cols-3 auto-rows-auto gap-8">
					<For each={Object.values(inputs())}>
						{input => (
							<Show when={input.name !== ""}>
								<Input {...(input as InputProps)}></Input>
							</Show>
						)}
					</For>
					<button
						class="col-span-full w-min place-self-center text-[1.75rem] p-2 px-6 shadow-lg shadow-gray-400 rounded-lg transition-colors bg-green-300 hover:bg-green-400 focus:bg-green-400 group-[:is(.animate-shake)]/form:bg-red-500"
						type="submit"
					>
						{submitText()}
					</button>
				</form>
				<CloseButton classes="absolute top-4 right-4 w-[1.5rem] h-[1.5rem] text-xl" onClick={() => close()}></CloseButton>
			</div>
		</div>
	);
}
