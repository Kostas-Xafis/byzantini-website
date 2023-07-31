import { For, Show, onMount } from "solid-js";
import { CloseButton } from "./admin/table/CloseButton.solid";

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
	type: "checkbox" | "date" | "email" | "file" | "hidden" | "select" | "number" | "password" | "radio" | "tel" | "text" | "time" | "url";
	name: string;
	label: string;
	placeholder?: string;
	value?: string | number;
	required?: boolean;
	iconClasses?: string;
	disabled?: boolean;
	selectList?: string[];
	fileExtension?: string;
};

export default function Input(props: Props) {
	const { type, name, label, placeholder, value, required, iconClasses, disabled, selectList, fileExtension } = props;

	if (type === "date") {
		onMount(() => {
			//@ts-ignore
			document.querySelector(`input[name='${name}']`).valueAsDate = new Date();
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
		<label for={name} class={"relative h-min max-w-[30ch] grid text-xl rounded-md font-didact z-10"}>
			<Show when={type !== "select" && type !== "file"}>
				<i class={"absolute w-min text-lg text-gray-500 top-[calc(50%_-_14px)] left-[1.5rem] z-130 " + (iconClasses || "")}></i>
				<input
					class="peer m-2 px-12 py-3 pt-2 text-xl font-didact shadow-md shadow-gray-400 rounded-md focus:shadow-gray-500 focus:shadow-lg focus-visible:outline-none"
					type={type}
					name={name}
					placeholder={placeholder || ""}
					value={value || ""}
					disabled={disabled || false}
					onfocus={(e: FocusEvent) => required && (e.currentTarget as HTMLElement).removeAttribute("required")}
					onblur={(e: FocusEvent) =>
						required &&
						(e.currentTarget as HTMLInputElement).value === "" &&
						(e.currentTarget as HTMLElement).setAttribute("required", "")
					}
					accept={fileExtension || undefined}
				/>
			</Show>
			{/*--------------------------------SELECT INPUT---------------------------------------- */}
			<Show when={type === "select"}>
				<i class={"absolute w-min text-lg text-gray-500 top-[calc(50%_-_14px)] left-[1.5rem] z-130 " + (iconClasses || "")}></i>
				<select
					class="peer m-2 px-12 py-3 pt-2 text-xl font-didact max-w-[calc(30ch-1rem)] shadow-md shadow-gray-400 rounded-md focus:shadow-gray-500 focus:shadow-lg focus-visible:outline-none"
					name={name}
					onblur={(e: FocusEvent) => required && (e.currentTarget as HTMLElement).removeAttribute("required")}
					onfocus={(e: FocusEvent) => required && (e.currentTarget as HTMLElement).setAttribute("required", "")}
					disabled={disabled || false}
				>
					<For each={selectList}>
						{(selectItem, index) => (
							<option selected={index() === value} value={index()}>
								{selectItem}
							</option>
						)}
					</For>
				</select>
			</Show>
			{/*--------------------------------FILE INPUT---------------------------------------- */}
			<Show when={type === "file"}>
				<div
					data-name={name}
					class={
						"peer/file group/file hidden w-[90%] max-w-[30ch] h-min my-3 py-2 justify-self-center self-center flex-col place-items-center font-didact border-dashed border-2 border-gray-600 rounded-md overflow-x-hidden " +
						(value ? "show" : "")
					}
				>
					<CloseButton onClick={onFileRemove} classes="text-lg w-[1.4rem] h-[1.4rem]"></CloseButton>
					<p>{value}</p>
				</div>
				<div
					data-name={name}
					onclick={onFileClick}
					class="peer peer-[:is(.show)]/file:hidden show group/file w-[90%] h-min my-3 py-2 justify-self-center self-center flex flex-col place-items-center font-didact border-dashed border-2 border-gray-600 rounded-md cursor-pointer hover:bg-gray-600"
				>
					<i class={"text-4xl text-gray-400 group-hover/file:text-gray-50 " + (iconClasses || "")}></i>
					<p class="text-xl text-gray-400  group-hover/file:text-gray-50">Drag&Drop</p>
				</div>
				<input
					class="hidden"
					type={type}
					name={name}
					required={required || false}
					disabled={disabled || false}
					onchange={onFileChange}
					accept={fileExtension || undefined}
				/>
				<style>
					{`.show {
						display: flex;
					}`}
				</style>
			</Show>
			<p class="absolute w-min bg-white rounded-md left-2 whitespace-nowrap -top-[calc(1ch_*_1.5)] px-[0.5ch] peer-[:not(:focus-within):invalid]:text-red-400">
				{label}
				{required ? <i class="absolute bg-white left-[-0.5ch] top-0.5 text-xs fa-regular fa-asterisk" /> : ""}
			</p>
			<div class="absolute inset-0 w-full h-full rounded-md border-2 border-gray-800 peer-[:not(:focus-within):invalid]:border-red-400 -z-10"></div>
		</label>
	);
}
