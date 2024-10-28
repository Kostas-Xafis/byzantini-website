import { Index, Show, onMount } from "solid-js";
import type { CustomEvents } from "../../../types/custom-events";
import type { PartialBy } from "../../../types/helpers";
import Tooltip, { type TooltipProps } from "../Tooltip.solid";
import DateInput from "./DateInput.solid";
import FileInput, { type FileInputProps } from "./FileInput.solid";
import MultiFileInput, { type MultiFileInputProps } from "./MultiFileInput.solid";
import { createSignal } from "solid-js";
import { AnimTimeline } from "../../../lib/utils.client";

function disable(input: Props) {
	input.disabled = true;
}

export class InputFields<T extends Record<string, Partial<Props>>> {
	#inputs: T = {} as T;

	constructor(input: T) {
		this.#inputs = input;
	}

	private static disable(input: Props) {
		input.disabled = true;
	}

	omit(keys: (keyof T)[]): this {
		for (const key of keys) {
			this.#inputs[key].disabled = true;
		}
		return this;
	}

	pick(keys: (keyof T)[]) {
		for (const key in this.#inputs) {
			if (!keys.includes(key)) InputFields.disable(this.#inputs[key] as Props);
		}
		return this;
	}

	fill(obj: Record<keyof T, InputProps["value"]>): this;
	fill(obj: (field: T[keyof T], key: keyof T) => void): this;
	fill(obj: Record<keyof T, InputProps["value"]> | ((field: T[keyof T], key: keyof T) => void)) {
		if (obj instanceof Function) {
			for (const key in this.#inputs) obj(this.#inputs[key], key);
		} else {
			for (const key in obj) if (key in this.#inputs) this.#inputs[key].value = obj[key];
		}
		return this;
	}

	empty() {
		for (const key in this.#inputs) this.#inputs[key] = {} as any;
		return this;
	}

	getInputs() {
		return this.#inputs;
	}

	setInputs(inputs: T) {
		this.#inputs = inputs;
		return this;
	}

	static Pick<T>(inputs: { [key in keyof T]: Props }, ...keys: (keyof T)[]) {
		for (const key in inputs) {
			if (!keys.includes(key)) this.disable(inputs[key]);
		}
		return inputs;
	}

	static Omit<T>(inputs: { [key in keyof T]: Props }, ...keys: (keyof T)[]) {
		for (const key of keys) {
			this.disable(inputs[key]);
		}
		return inputs;
	}

	static Fill<T extends {}>(inputs: { [key in keyof T]: Props }, obj: T) {
		for (const key in obj) {
			if (key in inputs) inputs[key].value = obj[key] as string;
		}
		return inputs;
	}

	static Empty<T>(inputs: { [key in keyof T]: Partial<Props> }) {
		for (const key in inputs) inputs[key] = {};
		return inputs;
	}
}
export function Pick<T>(inputs: { [key in keyof T]: Props }, ...keys: (keyof T)[]) {
	for (const key in inputs) {
		if (!keys.includes(key)) disable(inputs[key]);
	}
	return inputs;
}

export function Omit<T>(inputs: { [key in keyof T]: Props }, ...keys: (keyof T)[]) {
	for (const key of keys) {
		disable(inputs[key]);
	}
	return inputs;
}

export function Fill<T extends {}>(inputs: { [key in keyof T]: Props }, obj: T) {
	for (const key in obj) {
		if (key in inputs) inputs[key].value = obj[key] as string;
	}
	return inputs;
}

export function Empty<T>(inputs: { [key in keyof T]: Partial<Props> }) {
	for (const key in inputs) inputs[key] = {};
	return inputs;
}

type InputProps = {
	type:
		| null
		| "checkbox"
		| "date"
		| "email"
		| "file"
		| "hidden"
		| "select"
		| "multifile"
		| "multiselect"
		| "number"
		| "password"
		| "radio"
		| "tel"
		| "text"
		| "textarea"
		| "time"
		| "url";
	name: string;
	label: string;
	prefix: string;
	placeholder?: string | number;
	value?: string[] | string | number | FileInputProps["value"] | MultiFileInputProps["value"];
	required?: boolean;
	iconClasses?: string;
	disabled?: boolean;
	blurDisabled?: boolean;
	selectList?: string[];
	valueList?: (string | number)[];
	valueLiteral?: boolean;
	multiselectList?: {
		value: number;
		label: string;
		selected: boolean | undefined;
	}[];
	multiselectOnce?: boolean;
	fileExtension?: string;
	metadata?: Record<string, any>;
	minmax?: [number, number];
	onchange?: (e: Event) => void;
	tooltip?: TooltipProps;
	listeners?: boolean;
	show?: boolean;
};

export type Props = PartialBy<InputProps, "prefix">;

export default function Input(props: InputProps) {
	const {
		type,
		name,
		label,
		placeholder,
		value,
		required,
		iconClasses,
		disabled,
		blurDisabled = true,
		selectList,
		valueList,
		valueLiteral = false,
		multiselectList,
		multiselectOnce,
		minmax,
		onchange,
		tooltip,
		listeners = false,
		show = true,
	} = props;
	if (type === null) return <></>;

	let [isShown, setIsShown] = createSignal(show);

	document.querySelectorAll(".formInputs").forEach((inp) => {
		inp.addEventListener("focus", (e: FocusEvent) => {
			(e.currentTarget as HTMLElement).removeAttribute("required");
		});
	});
	document.querySelectorAll(".formInputs").forEach((inp) => {
		inp.addEventListener("blur", (e: FocusEvent) => {
			(e.currentTarget as HTMLElement).setAttribute("required", "");
		});
	});

	if (listeners) {
		onMount(() => {
			const selector = document.querySelector(`[name='${name}']`);
			if (!selector) return;
			selector.addEventListener("enable_input", ((e: CustomEvents["enable_input"]) => {
				if (isShown() === e.detail) return;
				const sParent = selector.parentElement as HTMLElement;
				const action = e.detail ? "fadeIn" : "fadeOut";
				const atl = new AnimTimeline();
				atl.step(() => {
					if (action === "fadeIn") {
						setIsShown(e.detail);
					}
					sParent.style.setProperty("--fade-duration", "500ms");
					void sParent.offsetWidth;
					sParent.classList.add(action);
				})
					.step({
						time: 500,
						anim: () => {
							if (action === "fadeOut") {
								setIsShown(e.detail);
							}
							sParent.classList.remove(action);
						},
					})
					.start();
			}) as any);
		});
	}

	const isExtended = type === "textarea" || type === "multifile";
	return (
		<label
			for={name}
			class={
				"group/tooltip relative h-min max-h-[200px] max-w-[30ch] max-sm:max-w-[27.5ch] w-full grid grid-rows-[1fr] text-xl rounded-md font-didact" +
				(isExtended ? " col-span-full max-w-full !h-[300px] max-h-[300px]" : "") +
				(disabled && blurDisabled ? " blur-[1px]" : "") +
				(isShown() ? "" : " hidden")
			}>
			{/*--------------------------------GENERIC INPUT--------------------------------------- */}
			<Show
				when={
					type !== "date" &&
					type !== "file" &&
					type !== "multiselect" &&
					type !== "multifile" &&
					type !== "select" &&
					type !== "textarea"
				}>
				<i
					class={
						"absolute w-min text-lg text-gray-500 top-[calc(50%_-_14px)] left-[1.5rem] z-20 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.2)] " +
						(iconClasses || "")
					}></i>
				<input
					class="peer m-2 px-12 max-sm:pr-2 py-3 text-xl font-didact w-[calc(100%_-_1rem)] bg-white shadow-md shadow-gray-400 rounded-md focus:shadow-gray-500 focus:shadow-lg !outline-none z-10"
					type={type}
					name={name}
					placeholder={(placeholder as string) || ""}
					value={value === 0 ? "0" : (value as any) || ""}
					readOnly={disabled || false}
					min={minmax?.[0] || ""}
					max={minmax?.[1] || ""}
					onfocus={(e: FocusEvent) =>
						required && (e.currentTarget as HTMLElement).removeAttribute("required")
					}
					onblur={(e: FocusEvent) =>
						required &&
						(e.currentTarget as HTMLInputElement).value === "" &&
						(e.currentTarget as HTMLElement).setAttribute("required", "")
					}
					onchange={onchange}
				/>
			</Show>
			<Show when={type === "date"}>
				<DateInput {...(props as InputProps & { value?: string | number })} />
			</Show>
			{/*---------------------------------SELECT INPUT--------------------------------------- */}
			<Show when={type === "select"}>
				<i
					class={
						"absolute w-min text-lg text-gray-500 top-[calc(50%_-_14px)] left-[1.5rem] z-20 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.2)] " +
						(iconClasses || "")
					}></i>
				<select
					class="peer m-2 px-12 max-sm:pr-2 py-3 text-xl font-didact w-[calc(100%_-_1rem)] shadow-md shadow-gray-400 rounded-md focus:shadow-gray-500 focus:shadow-lg focus-visible:outline-none z-10"
					name={name}
					onblur={(e: FocusEvent) =>
						required && (e.currentTarget as HTMLElement).removeAttribute("required")
					}
					onfocus={(e: FocusEvent) =>
						required && (e.currentTarget as HTMLElement).setAttribute("required", "")
					}
					onchange={onchange}
					disabled={disabled || false}>
					<option value="undefined"></option>
					<Index each={selectList}>
						{(selectItem, index) => (
							<option
								selected={
									valueLiteral
										? selectItem() === value
										: valueList
										? valueList[index] === value
										: index === value
								}
								value={
									valueLiteral
										? selectItem()
										: valueList
										? valueList[index]
										: index
								}>
								{selectItem()}
							</option>
						)}
					</Index>
				</select>
			</Show>
			{/*-------------------------------MULTISELECT INPUT------------------------------------ */}
			<Show when={type === "multiselect"}>
				<i
					class={
						"absolute w-min text-lg text-gray-500 top-[calc(50%_-_14px)] left-[1.5rem] z-20 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.2)] " +
						(iconClasses || "")
					}></i>
				<div class="m-2 pl-8 py-3 text-xl font-didact max-w-[calc(30ch-1rem)] shadow-md shadow-gray-400 rounded-md focus:shadow-gray-500 focus:shadow-lg overflow-x-hidden z-10">
					<Index each={multiselectList}>
						{(selectItem) =>
							selectItem().value !== null || selectItem().value !== undefined ? (
								<button
									data-specifier={name}
									data-selected={selectItem().selected}
									data-value={selectItem().value}
									class="group/multiselect ml-4 relative grid grid-cols-[20px_1fr] items-center justify-center"
									onClick={(e: MouseEvent) => {
										if (multiselectOnce) {
											const buttons = document.querySelectorAll(
												`button[data-specifier=${name}][data-selected='true']`
											);
											buttons.forEach((button) => {
												button.setAttribute("data-selected", "false");
											});
										}
										const button = e.currentTarget as HTMLButtonElement;
										button.setAttribute(
											"data-selected",
											button.getAttribute("data-selected") === "true"
												? "false"
												: "true"
										);
									}}
									type="button">
									<i class="absolute top-[calc(50%_-_10px)] left-0 width-[20px] text-gray-500 fa-regular fa-square group-[:is([data-selected='true'])]/multiselect:hidden"></i>
									<i class="absolute top-[calc(50%_-_10px)] left-0 width-[20px] text-gray-500 fa-solid fa-square-check group-[:is([data-selected='false'])]/multiselect:hidden"></i>
									<p
										class="p-2 font-didact text-start"
										style={{ "grid-column": "2 / 3" }}>
										{selectItem().label}
									</p>
								</button>
							) : (
								<></>
							)
						}
					</Index>
				</div>
			</Show>
			{/*----------------------------------FILE INPUT---------------------------------------- */}
			<Show when={type === "file"}>
				<FileInput {...(props as any)} />
			</Show>
			{/*--------------------------------MULTIFILE INPUT---------------------------------------- */}
			<Show when={type === "multifile"}>
				<MultiFileInput {...(props as any)} />
			</Show>
			{/*--------------------------------TEXTAREA INPUT---------------------------------------- */}
			<Show when={type === "textarea"}>
				<i
					class={
						"absolute w-min text-lg text-gray-500 top-[calc(50%_-_14px)] left-[1.5rem] z-20 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.2)] " +
						(iconClasses || "")
					}></i>
				<textarea
					class="peer m-2 px-12 max-sm:pr-2 py-3 text-xl font-didact w-[calc(100%_-_1rem)] shadow-md shadow-gray-400 rounded-md focus:shadow-gray-500 focus:shadow-lg focus-visible:outline-none z-10"
					name={name}
					placeholder={(placeholder as string) || ""}
					value={value === 0 ? "0" : (value as any) || ""}
					readOnly={disabled || false}
					onfocus={(e: FocusEvent) =>
						required && (e.currentTarget as HTMLElement).removeAttribute("required")
					}
					onblur={(e: FocusEvent) =>
						required &&
						(e.currentTarget as HTMLInputElement).value === "" &&
						(e.currentTarget as HTMLElement).setAttribute("required", "")
					}
				/>
			</Show>
			<p class="absolute w-min bg-white rounded-md left-2 whitespace-nowrap -top-[calc(1ch_*_1.5)] px-[0.5ch] peer-[:not(:focus-within):invalid]:text-red-400 z-10">
				{label}
				{required ? (
					<i class="absolute bg-transparent left-[-0.5ch] top-0.5 text-xs fa-regular fa-asterisk" />
				) : (
					<></>
				)}
			</p>
			<div class="absolute inset-0 w-full h-full rounded-md border-2 border-gray-800 peer-[:not(:focus-within):invalid]:border-red-400"></div>
			{tooltip ? <Tooltip {...tooltip} /> : <></>}
		</label>
	);
}
