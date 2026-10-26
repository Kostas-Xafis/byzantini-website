import type { CustomEvents } from "@_types/custom-events";
import type { AnyRecord, DOMElement } from "@_types/global";
import type { PartialBy } from "@_types/helpers";
import type { FileProxy } from "@lib/fileHandling.client";
import { AnimTimeline } from "@utilities/dom";
import { Index, Show, createSignal, onMount, type JSX } from "solid-js";
import Tooltip, { type TooltipProps } from "../Tooltip.solid";
import DateInput from "./DateInput.solid";
import FileInput, { type FileInputProps } from "./FileInput.solid";
import MultiFileInput, { type MultiFileInputProps } from "./MultiFileInput.solid";
import { FIELD_CONTROL, FIELD_ICON, FIELD_LABEL, FIELD_OUTLINE } from "./styles";

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

type InputProps = {
	type:
		| null
		| "checkbox"
		/** Renders `render()` across the whole form row — for composite fields the generic inputs cannot express. */
		| "custom"
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
	/** Browser autofill hint for text-like inputs (e.g. "family-name", "postal-code", "off"). */
	autocomplete?: string;
	/** On-screen keyboard for text-like inputs (e.g. "numeric" for ΑΜ/ΑΜΚΑ). */
	inputMode?: "numeric" | "tel" | "email" | "text";
	selectList?: string[];
	valueList?: (string | number)[];
	valueLiteral?: boolean;
	multiselectList?: {
		value: number;
		label: string;
		selected: boolean | undefined;
	}[];
	multiselectOnce?: boolean;
	minmax?: [number, number];
	onchange?: (e: Event) => void;
	tooltip?: TooltipProps;
	listeners?: boolean;
	show?: boolean;
	isExtended?: boolean;
	fileExtension?: string;
	metadata?: AnyRecord;
	filePreview?: (file: FileProxy<AnyRecord>) => Promise<DOMElement>;
	/** Content of a `type: "custom"` input; it renders (and names) its own form controls. */
	render?: () => JSX.Element;
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
		autocomplete,
		inputMode,
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
		isExtended,
	} = props;
	if (type === null || type === "hidden") return <></>;
	if (type === "custom") return <>{props.render?.()}</>;

	let [isShown, setIsShown] = createSignal(show);

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

	const getInputSpecific = (type: InputProps["type"]) => {
		const isExt = isExtended || false;
		switch (type) {
			case "textarea":
				return " col-span-full max-w-full !h-[300px] max-h-[300px]";
			case "multifile":
				return " col-span-full max-w-full !h-[400px] max-h-[400px]";
			case "file":
				return ` ${isExt ? "col-span-full" : ""} w-[50%] justify-self-center !h-[300px] max-h-[300px]`;
			default:
				return "";
		}
	};

	return (
		// The label wraps its control, which is what links them — an explicit `for` without a matching id would break it.
		<label
			class={
				"group/tooltip relative h-min max-h-[200px] max-w-[32ch] max-sm:max-w-[29ch] w-full grid grid-rows-[1fr] text-lg rounded-xl font-didact" +
				getInputSpecific(type) +
				(disabled && blurDisabled ? " blur-[1px]" : "") +
				(isShown() ? "" : " hidden")
			}>
			{/*--------------------------------GENERIC INPUT--------------------------------------- */}
			<Show when={type !== "date" && type !== "file" && type !== "multiselect" && type !== "multifile" && type !== "select" && type !== "textarea"}>
				<input
					class={FIELD_CONTROL}
					type={type}
					name={name}
					aria-required={required ? "true" : undefined}
					autocomplete={autocomplete}
					inputmode={inputMode}
					placeholder={(placeholder as string) || ""}
					value={value === 0 ? "0" : (value as any) || ""}
					readOnly={disabled || false}
					min={minmax?.[0] || ""}
					max={minmax?.[1] || ""}
					onfocus={(e: FocusEvent) => required && (e.currentTarget as HTMLElement).removeAttribute("required")}
					onblur={(e: FocusEvent) =>
						required && (e.currentTarget as HTMLInputElement).value === "" && (e.currentTarget as HTMLElement).setAttribute("required", "")
					}
					onchange={onchange}
				/>
				<i class={FIELD_ICON + " " + (iconClasses || "")} aria-hidden="true"></i>
			</Show>
			<Show when={type === "date"}>
				<DateInput {...(props as InputProps & { value?: number })} />
			</Show>
			{/*---------------------------------SELECT INPUT--------------------------------------- */}
			<Show when={type === "select"}>
				<select
					class={FIELD_CONTROL + " cursor-pointer"}
					name={name}
					aria-required={required ? "true" : undefined}
					onblur={(e: FocusEvent) => required && (e.currentTarget as HTMLElement).removeAttribute("required")}
					onfocus={(e: FocusEvent) => required && (e.currentTarget as HTMLElement).setAttribute("required", "")}
					onchange={onchange}
					disabled={disabled || false}>
					<option value="undefined"></option>
					<Index each={selectList}>
						{(selectItem, index) => (
							<option
								selected={valueLiteral ? selectItem() === value : valueList ? valueList[index] === value : index === value}
								value={valueLiteral ? selectItem() : valueList ? valueList[index] : index}>
								{selectItem()}
							</option>
						)}
					</Index>
				</select>
				<i class={FIELD_ICON + " " + (iconClasses || "")} aria-hidden="true"></i>
			</Show>
			{/*-------------------------------MULTISELECT INPUT------------------------------------ */}
			<Show when={type === "multiselect"}>
				<div class="peer m-1.5 flex max-h-[176px] flex-wrap content-start gap-2 overflow-y-auto rounded-lg bg-white py-2.5 pr-2 pl-10 font-didact text-base text-red-950 z-10 dark:bg-dark dark:text-red-50">
					<Index each={multiselectList}>
						{(selectItem) =>
							selectItem().value !== null || selectItem().value !== undefined ? (
								<button
									data-specifier={name}
									data-selected={selectItem().selected}
									data-value={selectItem().value}
									aria-pressed={selectItem().selected ? "true" : "false"}
									class="group/multiselect inline-flex items-center gap-x-2 rounded-full border border-gray-300 px-3 py-1 text-start transition-colors hover:border-red-800/60 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800 data-[selected=true]:border-red-900 data-[selected=true]:bg-red-900 data-[selected=true]:text-white dark:border-neutral-600 dark:hover:border-red-400/60 dark:hover:bg-red-900/30 dark:data-[selected=true]:border-red-700 dark:data-[selected=true]:bg-red-800"
									onClick={(e: MouseEvent) => {
										if (multiselectOnce) {
											const buttons = document.querySelectorAll(`button[data-specifier=${name}][data-selected='true']`);
											buttons.forEach((button) => {
												button.setAttribute("data-selected", "false");
												button.setAttribute("aria-pressed", "false");
											});
										}
										const button = e.currentTarget as HTMLButtonElement;
										const selected = button.getAttribute("data-selected") !== "true";
										button.setAttribute("data-selected", selected ? "true" : "false");
										button.setAttribute("aria-pressed", selected ? "true" : "false");
									}}
									type="button">
									{/* single choice reads as a radio, multiple choice as checkboxes */}
									<i
										class={
											"text-sm opacity-70 group-data-[selected=true]/multiselect:hidden " +
											(multiselectOnce ? "fa-regular fa-circle" : "fa-regular fa-square")
										}
										aria-hidden="true"></i>
									<i
										class={
											"hidden text-sm group-data-[selected=true]/multiselect:inline-block " +
											(multiselectOnce ? "fa-solid fa-circle-dot" : "fa-solid fa-square-check")
										}
										aria-hidden="true"></i>
									<span>{selectItem().label}</span>
								</button>
							) : (
								<></>
							)
						}
					</Index>
				</div>
				<i class={FIELD_ICON + " top-[1.15rem]! " + (iconClasses || "")} aria-hidden="true"></i>
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
				<textarea
					class={FIELD_CONTROL + " resize-none"}
					name={name}
					aria-required={required ? "true" : undefined}
					placeholder={(placeholder as string) || ""}
					value={value === 0 ? "0" : (value as any) || ""}
					readOnly={disabled || false}
					onfocus={(e: FocusEvent) => required && (e.currentTarget as HTMLElement).removeAttribute("required")}
					onblur={(e: FocusEvent) =>
						required && (e.currentTarget as HTMLInputElement).value === "" && (e.currentTarget as HTMLElement).setAttribute("required", "")
					}
				/>
				<i class={FIELD_ICON + " top-[1.15rem]! " + (iconClasses || "")} aria-hidden="true"></i>
			</Show>
			<p class={FIELD_LABEL}>
				{label}
				{required ? (
					<span class="ml-0.5 text-red-700 dark:text-red-400" aria-hidden="true">
						*
					</span>
				) : (
					<></>
				)}
			</p>
			{/* filled like the control (no inset box on translucent cards) — except behind file pickers, whose previews it would cover */}
			<div class={FIELD_OUTLINE + (type === "file" || type === "multifile" ? "" : " bg-white dark:bg-dark")}></div>
			{tooltip ? <Tooltip {...tooltip} /> : <></>}
		</label>
	);
}
