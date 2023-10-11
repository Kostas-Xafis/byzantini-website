import { createEffect, createSignal, For, Show } from "solid-js";
import type { Props as InputProps } from "../../input/Input.solid";
import Input from "../../input/Input.solid";
import { CloseButton } from "./CloseButton.solid";
import Spinner from "../../other/Spinner.solid";

type Props = {
	open: boolean;
	inputs: Record<string, Partial<InputProps>>;
	close: () => void;
	submitText: string;
	headerText: string;
	prefix: string;
};

export const [loading, setLoading] = createSignal(false, { equals: false });

export default function Modal(props: Props) {
	const { close, prefix } = props;
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

	const onSubmit = (e: Event) => {
		document
			.querySelector(`form[data-prefix='${prefix}']`)
			?.dispatchEvent(new Event("submit"));
		setLoading(true);
	};

	return (
		<div
			class={
				"modal fixed z-[5000] inset-0 w-full h-full bg-[rgb(120_120_120_/_0.2)] grid drop-shadow-[-1px_1px_2px_rgba(0,0,0,0.25)]" +
				(!open() ? " hidden" : "")
			}
		>
			<div class="relative max-w-[70%] max-sm:max-w-[92.5%] h-max max-h-[90vh] max-sm:max-h-[80dvh] max-sm:mt-[86px] p-6 bg-white place-self-center grid grid-rows-[max-content_1fr_max-content] shadow-lg shadow-gray-700 rounded-md gap-y-4 justify-center">
				<p class="text-4xl p-2 w-full text-center max-sm:text-3xl">
					{headerText()}
				</p>
				<form
					data-prefix={prefix}
					class="peer/form group/form grid grid-cols-3 auto-rows-max gap-8 py-4 overflow-y-auto max-sm:grid-cols-1"
				>
					<For each={Object.values(inputs())}>
						{(input) => (
							<Show when={input.name !== ""}>
								<Input {...(input as InputProps)}></Input>
							</Show>
						)}
					</For>
				</form>
				<Show
					when={!loading()}
					fallback={<Spinner classes="max-sm:h-[100svh]" />}
				>
					<button
						class={
							"col-span-full w-min place-self-center text-[1.75rem] p-2 px-6 shadow-lg shadow-gray-400 rounded-lg transition-colors bg-green-300 hover:bg-green-500 focus:bg-green-500 peer-[:is(.animate-shake)]/form:bg-red-500" +
							" max-sm:text-2xl"
						}
						type="submit"
						onClick={onSubmit}
					>
						{submitText()}
					</button>
				</Show>
				<CloseButton
					classes="absolute top-4 right-4 w-[1.5rem] h-[1.5rem] text-xl max-sm:w-8 max-sm:h-8 max-sm:text-lg"
					onClick={() => close()}
				></CloseButton>
			</div>
		</div>
	);
}
