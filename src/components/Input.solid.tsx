import { For, Show, onMount } from "solid-js";
import { CloseButton } from "./admin/table/CloseButton.solid";
import type { TooltipProps } from "./Tooltip.solid";
import Tooltip from "./Tooltip.solid";

function disable(input: Props) {
	input.disabled = true;
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

export type Props = {
	type:
		| null
		| "checkbox"
		| "date"
		| "email"
		| "file"
		| "hidden"
		| "select"
		| "multiselect"
		| "number"
		| "password"
		| "radio"
		| "tel"
		| "text"
		| "time"
		| "url";
	name: string;
	label: string;
	placeholder?: string;
	value?: string | number;
	required?: boolean;
	iconClasses?: string;
	disabled?: boolean;
	blurDisabled?: boolean;
	selectList?: string[];
	valueList?: (string | number)[];
	valueLiteral?: boolean;
	multiselectList?: { value: number; label: string; selected: boolean }[];
	multiselectOnce?: boolean;
	fileExtension?: string;
	minmax?: [number, number];
	tooltip?: TooltipProps;
};

export default function Input(props: Props) {
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
		fileExtension,
		minmax,
		tooltip
	} = props;
	if (type === null) return <></>;
	if (type === "date") {
		onMount(() => {
			if (value !== 0) {
				//@ts-ignore
				document.querySelector(`input[name='${name}']`).valueAsDate = new Date(value);
			}
		});
	}
	let onFileClick;
	let onFileChange;
	let onFileRemove;
	if (type === "file") {
		onFileClick = (e: MouseEvent) => {
			const input = document.querySelector(`input[name='${name}']`) as HTMLInputElement;
			input.click();
		};
		onFileChange = async (e: Event) => {
			const input = e.currentTarget as HTMLInputElement;
			const file = input.files?.[0];
			const fileDiv = document.querySelector(`div[data-name='${name}']`) as HTMLDivElement;
			if (file) {
				fileDiv.classList.add("show");
				(document.querySelector(`div[data-name='${name}'] > p`) as HTMLElement).innerText = file.name;
			} else fileDiv.classList.remove("show");
		};
		onFileRemove = (e: MouseEvent) => {
			const input = document.querySelector(`input[name='${name}']`) as HTMLInputElement;
			input.value = "";
			const fileDiv = document.querySelector(`div[data-name='${name}']`) as HTMLDivElement;
			fileDiv.classList.remove("show");
			if (value) document.dispatchEvent(new CustomEvent("emptyFileRemove", { detail: value }));
		};
	}
	document.querySelectorAll(".formInputs").forEach(inp => {
		(inp as HTMLElement).addEventListener("focus", (e: FocusEvent) => {
			(e.currentTarget as HTMLElement).removeAttribute("required");
		});
	});
	document.querySelectorAll(".formInputs").forEach(inp => {
		(inp as HTMLElement).addEventListener("blur", (e: FocusEvent) => {
			(e.currentTarget as HTMLElement).setAttribute("required", "");
		});
	});

	return (
		<label
			for={name}
			class={
				"group/tooltip relative h-min max-h-[200px] max-w-[30ch] max-sm:max-w-[27.5ch] w-full grid grid-rows-[1fr] text-xl rounded-md font-didact"
			}
		>
			<Show when={type !== "select" && type !== "file" && type !== "multiselect"}>
				<i class={"absolute w-min text-lg text-gray-500 top-[calc(50%_-_14px)] left-[1.5rem] z-20 " + (iconClasses || "")}></i>
				<input
					class={
						"peer m-2 px-12 max-sm:pr-2 py-3 text-xl font-didact w-[calc(100%_-_1rem)] shadow-md shadow-gray-400 rounded-md focus:shadow-gray-500 focus:shadow-lg focus-visible:outline-none z-10" +
						(disabled && blurDisabled ? " blur-[1px]" : "")
					}
					type={type}
					name={name}
					placeholder={placeholder || ""}
					value={value === 0 ? "0" : value || ""}
					readOnly={disabled || false}
					min={minmax?.[0] || ""}
					max={minmax?.[1] || ""}
					onfocus={(e: FocusEvent) => required && (e.currentTarget as HTMLElement).removeAttribute("required")}
					onblur={(e: FocusEvent) =>
						required &&
						(e.currentTarget as HTMLInputElement).value === "" &&
						(e.currentTarget as HTMLElement).setAttribute("required", "")
					}
				/>
			</Show>
			{/*--------------------------------SELECT INPUT---------------------------------------- */}
			<Show when={type === "select"}>
				<i class={"absolute w-min text-lg text-gray-500 top-[calc(50%_-_14px)] left-[1.5rem] z-20 " + (iconClasses || "")}></i>
				<select
					class={
						"peer m-2 px-12 max-sm:pr-2 py-3 text-xl font-didact w-[calc(100%_-_1rem)] shadow-md shadow-gray-400 rounded-md focus:shadow-gray-500 focus:shadow-lg focus-visible:outline-none z-10" +
						(disabled && blurDisabled ? " blur-[1px]" : "")
					}
					name={name}
					onblur={(e: FocusEvent) => required && (e.currentTarget as HTMLElement).removeAttribute("required")}
					onfocus={(e: FocusEvent) => required && (e.currentTarget as HTMLElement).setAttribute("required", "")}
					disabled={disabled || false}
				>
					<option value="undefined"></option>
					<For each={selectList}>
						{(selectItem, index) => (
							<option
								selected={
									valueLiteral ? selectItem === value : valueList ? valueList[index()] === value : index() === value
								}
								value={valueLiteral ? selectItem : valueList ? valueList[index()] : index()}
							>
								{selectItem}
							</option>
						)}
					</For>
				</select>
			</Show>
			{/*--------------------------------MULTISELECT INPUT---------------------------------------- */}
			<Show when={type === "multiselect"}>
				<i class={"absolute w-min text-lg text-gray-500 top-[calc(50%_-_14px)] left-[1.5rem] z-20 " + (iconClasses || "")}></i>
				<div class="m-2 px-12 py-3 text-xl font-didact max-w-[calc(30ch-1rem)] shadow-md shadow-gray-400 rounded-md focus:shadow-gray-500 focus:shadow-lg overflow-x-hidden z-10">
					<For each={multiselectList}>
						{(selectItem, index) =>
							selectItem.value !== null || selectItem.value !== undefined ? (
								<button
									data-specifier={name}
									data-selected={selectItem.selected}
									data-value={selectItem.value}
									class="group/multiselect ml-4 relative grid grid-cols-[20px_1fr] items-center justify-center"
									onClick={(e: MouseEvent) => {
										if (multiselectOnce) {
											const buttons = document.querySelectorAll(`button[data-selected='true']`);
											buttons.forEach(button => {
												button.setAttribute("data-selected", "false");
											});
										}
										const button = e.currentTarget as HTMLButtonElement;
										button.setAttribute(
											"data-selected",
											button.getAttribute("data-selected") === "true" ? "false" : "true"
										);
									}}
									type="button"
								>
									<i class="absolute top-[calc(50%_-_10px)] left-0 width-[20px] text-gray-500 fa-regular fa-square group-[:is([data-selected='true'])]/multiselect:hidden"></i>
									<i class="absolute top-[calc(50%_-_10px)] left-0 width-[20px] text-gray-500 fa-solid fa-square-check group-[:is([data-selected='false'])]/multiselect:hidden"></i>
									<p class="p-2 font-didact text-start" style={{ "grid-column": "2 / 3" }}>
										{selectItem.label}
									</p>
								</button>
							) : (
								<></>
							)
						}
					</For>
				</div>
			</Show>
			{/*--------------------------------FILE INPUT---------------------------------------- */}
			<Show when={type === "file"}>
				<div
					data-name={name}
					class={
						"peer/file group/file hidden w-[90%] max-w-[30ch] h-min my-3 py-3 justify-self-center self-center flex-col place-items-center font-didact border-dashed border-2 border-gray-600 rounded-md overflow-x-hidden z-10" +
						(value ? " show" : "")
					}
				>
					<CloseButton onClick={onFileRemove} classes="text-lg w-[1.4rem] h-[1.4rem]"></CloseButton>
					<p>{value}</p>
				</div>
				<div
					data-name={name}
					onclick={onFileClick}
					class="peer peer-[:is(.show)]/file:hidden show group/file w-[90%] h-min my-3 py-3 justify-self-center self-center flex flex-col place-items-center font-didact border-dashed border-2 border-gray-600 rounded-md cursor-pointer hover:bg-gray-600 z-10"
				>
					<i class={"text-4xl text-gray-400 group-hover/file:text-gray-50 " + (iconClasses || "")}></i>
					<p class="text-xl text-gray-400  group-hover/file:text-gray-50">Drag&Drop</p>
				</div>
				<input
					class="hidden"
					type={type}
					name={name}
					required={required || false}
					readOnly={disabled || false}
					onchange={onFileChange}
					accept={fileExtension || undefined}
				/>
				<style>
					{`.show {
						display: flex;
					}`}
				</style>
			</Show>
			<p class="absolute w-min bg-white rounded-md left-2 whitespace-nowrap -top-[calc(1ch_*_1.5)] px-[0.5ch] peer-[:not(:focus-within):invalid]:text-red-400 z-10">
				{label}
				{required ? <i class="absolute bg-transparent left-[-0.5ch] top-0.5 text-xs fa-regular fa-asterisk" /> : <></>}
			</p>
			<div class="absolute inset-0 w-full h-full rounded-md border-2 border-gray-800 peer-[:not(:focus-within):invalid]:border-red-400"></div>
			{tooltip ? <Tooltip {...tooltip} /> : <></>}
		</label>
	);
}
