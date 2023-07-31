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
	createEffect(() => {
		setOpen(props.open);
		setInputs(props.inputs);
	});
	return (
		<dialog
			class={
				"fixed z-[10000] inset-0 w-full h-full bg-[rgb(190_190_190_/_0.15)] backdrop-blur-sm grid font-inter" +
				(!open() ? " hidden" : "")
			}
		>
			<div class="relative w-max h-min p-12 bg-white place-self-center grid grid-rows-[3.25rem_min-content] shadow-lg shadow-gray-700 rounded-md gap-y-12 justify-center">
				<p class="text-4xl p-2">{props.headerText}</p>
				<form class="group/form grid grid-cols-3 auto-rows-auto gap-8">
					<For each={Object.values(inputs())}>
						{input => (
							<Show when={input.name !== ""}>
								<Input {...(input as InputProps)}></Input>
							</Show>
						)}
					</For>
					<button
						class="col-span-full w-min place-self-center text-[1.75rem] p-2 px-6 shadow-lg shadow-gray-400 rounded-lg transition-colors bg-green-300 hover:bg-green-400 focus:bg-green-400 group/form-[:is(.animate-shake)]:bg-red-500"
						type="submit"
					>
						{props.submitText}
					</button>
				</form>
				<CloseButton classes="absolute top-4 right-4 w-[1.5rem] h-[1.5rem] text-xl" onClick={() => close()}></CloseButton>
			</div>
		</dialog>
	);
}
