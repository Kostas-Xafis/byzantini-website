import {
	type Setter,
	type Accessor,
	For,
	Show,
	onMount,
	createSignal,
} from "solid-js";
import { CloseButton } from "../admin/table/CloseButton.solid";
import type { TooltipProps } from "../Tooltip.solid";
import Tooltip from "../Tooltip.solid";
import { FileHandler } from "../../../lib/fileHandling.client";
import AirDatepicker from "air-datepicker";
import "air-datepicker/air-datepicker.css";
import { setFocusFixed } from "../../../lib/utils.client";

function disable(input: Props) {
	input.disabled = true;
}

export function Pick<T>(
	inputs: { [key in keyof T]: Props },
	...keys: (keyof T)[]
) {
	for (const key in inputs) {
		if (!keys.includes(key)) disable(inputs[key]);
	}
	return inputs;
}

export function Omit<T>(
	inputs: { [key in keyof T]: Props },
	...keys: (keyof T)[]
) {
	for (const key of keys) {
		disable(inputs[key]);
	}
	return inputs;
}

export function Fill<T extends {}>(
	inputs: { [key in keyof T]: Props },
	obj: T
) {
	for (const key in obj) {
		if (key in inputs) inputs[key].value = obj[key] as string;
	}
	return inputs;
}

export function Empty<T>(inputs: { [key in keyof T]: Partial<Props> }) {
	for (const key in inputs) inputs[key] = {};
	return inputs;
}

const days = ["Κυ", "Δε", "Τρ", "Τε", "Πε", "Πα", "Σα"];

const months = [
	"Ιαν",
	"Φεβ",
	"Μαρ",
	"Απρ",
	"Μαι",
	"Ιουν",
	"Ιουλ",
	"Αυγ",
	"Σεπ",
	"Οκτ",
	"Νοε",
	"Δεκ",
];

const monthsFull = [
	"Ιανουάριος",
	"Φεβρουάριος",
	"Μάρτιος",
	"Απρίλιος",
	"Μάιος",
	"Ιούνιος",
	"Ιούλιος",
	"Αύγουστος",
	"Σεπτέμβριος",
	"Οκτώβριος",
	"Νοέμβριος",
	"Δεκέμβριος",
];

export type Props = {
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
	placeholder?: string;
	value?: string | number;
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
		tooltip,
	} = props;
	if (type === null) return <></>;
	if (type === "date") {
		// if date input has value, set it
		onMount(() => {
			const hasValue = value !== undefined && value !== null;
			new AirDatepicker(`input[name='${name}']`, {
				view: "years",
				firstDay: 0,
				dateFormat: "yyyy-mm-dd",
				autoClose: true,
				isMobile: document.body.clientWidth < 768,
				selectedDates: hasValue ? [new Date(value)] : undefined,
				onSelect({ date, datepicker }) {
					if (!date || Array.isArray(date)) return;
					datepicker.hide();
					const dateInput = document.querySelector(
						`input[name='${name}']`
					) as HTMLInputElement;
					dateInput.valueAsDate = new Date(
						date.getTime() + 1000 * 60 * 60 * 24 // add 1 day to fix timezone bug
					);
					setFocusFixed(
						dateInput.parentElement
							?.nextElementSibling as HTMLElement
					);
				},
				locale: {
					days: days,
					daysShort: days,
					daysMin: days,
					months: monthsFull,
					monthsShort: months,
				},
			});
			if (!value) return;
			let d = document.querySelector(
				`input[name='${name}']`
			) as HTMLInputElement;
			d.valueAsDate = new Date(value);
		});
	}

	let onFileClick;
	let onFileChange;
	let onFileRemove: (fileId?: number) => void;
	if (type === "file") {
		onFileClick = (e: MouseEvent) => {
			const input = document.querySelector(
				`input[name='${name}']`
			) as HTMLInputElement;
			input.click();
		};
		onFileChange = async (e: Event) => {
			const input = e.currentTarget as HTMLInputElement;
			const file = input.files?.[0];
			const fileDiv = document.querySelector(
				`div[data-name='${name}']`
			) as HTMLDivElement;
			if (file) {
				fileDiv.classList.add("show");
				(
					document.querySelector(
						`div[data-name='${name}'] > p`
					) as HTMLElement
				).innerText = file.name;
			} else fileDiv.classList.remove("show");
		};
		onFileRemove = () => {
			const input = document.querySelector(
				`input[name='${name}']`
			) as HTMLInputElement;
			input.value = "";
			const fileDiv = document.querySelector(
				`div[data-name='${name}']`
			) as HTMLDivElement;
			fileDiv.classList.remove("show");
			if (value)
				document.dispatchEvent(
					//@ts-ignore
					new CustomEvent("emptyFileRemove", { detail: value })
				);
		};
	}

	let fileList: Accessor<string[]> = () => [],
		setFileList: Setter<string[]>;
	if (type === "multifile") {
		[fileList, setFileList] = createSignal<string[]>([]); // Need to be a signal to update the component
		const fileHandler = new FileHandler(name);
		onFileClick = (e: MouseEvent) => {
			e.stopPropagation();
			e.preventDefault();
			const input = document.querySelector(
				`input[name='${name}']`
			) as HTMLInputElement;
			input.click();
		};
		onFileChange = async (e: Event) => {
			const input = e.currentTarget as HTMLInputElement;
			const { files } = input;
			if (!files) return;
			fileHandler.addFiles(files);
			setFileList(fileHandler.getFiles().map((f) => f.name));
		};
		onFileRemove = (fileId: number = 0) => {
			console.log("removing file: ", fileId);
			fileHandler.removeFile(fileId);
			setFileList(fileHandler.getFiles().map((f) => f.name));
		};
		onMount(() => {
			const fileDiv = document.querySelector(
				"#multifileDropZone"
			) as HTMLElement;
			fileHandler.mountDragAndDrop(fileDiv, {
				enterEvent: (e) => {
					fileDiv.classList.add("bg-gray-600", "z-10", "unblur");
				},
				leaveEvent: (e) => {
					fileDiv.classList.remove("bg-gray-600", "z-10", "unblur");
				},
				dropEvent: (e) => {
					fileDiv.classList.remove("bg-gray-600", "z-10", "unblur");
					setFileList(fileHandler.getFiles().map((f) => f.name));
				},
			});
		});
	}

	document.querySelectorAll(".formInputs").forEach((inp) => {
		(inp as HTMLElement).addEventListener("focus", (e: FocusEvent) => {
			(e.currentTarget as HTMLElement).removeAttribute("required");
		});
	});
	document.querySelectorAll(".formInputs").forEach((inp) => {
		(inp as HTMLElement).addEventListener("blur", (e: FocusEvent) => {
			(e.currentTarget as HTMLElement).setAttribute("required", "");
		});
	});

	const isExtended = type === "textarea" || type === "multifile";
	return (
		<label
			for={name}
			class={
				"group/tooltip relative h-min max-h-[200px] max-w-[30ch] max-sm:max-w-[27.5ch] w-full grid grid-rows-[1fr] text-xl rounded-md font-didact" +
				(isExtended
					? " col-span-full max-w-full !h-[300px] max-h-[300px]"
					: "")
			}
		>
			{/*--------------------------------GENERIC INPUT---------------------------------------- */}
			<Show
				when={
					type !== "select" &&
					type !== "file" &&
					type !== "multiselect" &&
					type !== "multifile" &&
					type !== "textarea"
				}
			>
				<i
					class={
						"absolute w-min text-lg text-gray-500 top-[calc(50%_-_14px)] left-[1.5rem] z-20 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.2)] " +
						(iconClasses || "")
					}
				></i>
				<input
					class={
						"peer m-2 px-12 max-sm:pr-2 py-3 text-xl font-didact w-[calc(100%_-_1rem)] bg-white shadow-md shadow-gray-400 rounded-md focus:shadow-gray-500 focus:shadow-lg !outline-none z-10" +
						(disabled && blurDisabled ? " blur-[1px]" : "")
					}
					type={type}
					name={name}
					placeholder={placeholder || ""}
					value={value === 0 ? "0" : value || ""}
					readOnly={disabled || type === "date" || false}
					min={minmax?.[0] || ""}
					max={minmax?.[1] || ""}
					onfocus={(e: FocusEvent) =>
						required &&
						(e.currentTarget as HTMLElement).removeAttribute(
							"required"
						)
					}
					onblur={(e: FocusEvent) =>
						required &&
						(e.currentTarget as HTMLInputElement).value === "" &&
						(e.currentTarget as HTMLElement).setAttribute(
							"required",
							""
						)
					}
				/>
			</Show>
			{/*--------------------------------SELECT INPUT---------------------------------------- */}
			<Show when={type === "select"}>
				<i
					class={
						"absolute w-min text-lg text-gray-500 top-[calc(50%_-_14px)] left-[1.5rem] z-20 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.2)] " +
						(iconClasses || "")
					}
				></i>
				<select
					class={
						"peer m-2 px-12 max-sm:pr-2 py-3 text-xl font-didact w-[calc(100%_-_1rem)] shadow-md shadow-gray-400 rounded-md focus:shadow-gray-500 focus:shadow-lg focus-visible:outline-none z-10" +
						(disabled && blurDisabled ? " blur-[1px]" : "")
					}
					name={name}
					onblur={(e: FocusEvent) =>
						required &&
						(e.currentTarget as HTMLElement).removeAttribute(
							"required"
						)
					}
					onfocus={(e: FocusEvent) =>
						required &&
						(e.currentTarget as HTMLElement).setAttribute(
							"required",
							""
						)
					}
					disabled={disabled || false}
				>
					<option value="undefined"></option>
					<For each={selectList}>
						{(selectItem, index) => (
							<option
								selected={
									valueLiteral
										? selectItem === value
										: valueList
										? valueList[index()] === value
										: index() === value
								}
								value={
									valueLiteral
										? selectItem
										: valueList
										? valueList[index()]
										: index()
								}
							>
								{selectItem}
							</option>
						)}
					</For>
				</select>
			</Show>
			{/*--------------------------------MULTISELECT INPUT---------------------------------------- */}
			<Show when={type === "multiselect"}>
				<i
					class={
						"absolute w-min text-lg text-gray-500 top-[calc(50%_-_14px)] left-[1.5rem] z-20 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.2)] " +
						(iconClasses || "")
					}
				></i>
				<div class="m-2 px-12 py-3 text-xl font-didact max-w-[calc(30ch-1rem)] shadow-md shadow-gray-400 rounded-md focus:shadow-gray-500 focus:shadow-lg overflow-x-hidden z-10">
					<For each={multiselectList}>
						{(selectItem, index) =>
							selectItem.value !== null ||
							selectItem.value !== undefined ? (
								<button
									data-specifier={name}
									data-selected={selectItem.selected}
									data-value={selectItem.value}
									class="group/multiselect ml-4 relative grid grid-cols-[20px_1fr] items-center justify-center"
									onClick={(e: MouseEvent) => {
										if (multiselectOnce) {
											const buttons =
												document.querySelectorAll(
													`button[data-specifier=${name}][data-selected='true']`
												);
											buttons.forEach((button) => {
												button.setAttribute(
													"data-selected",
													"false"
												);
											});
										}
										const button =
											e.currentTarget as HTMLButtonElement;
										button.setAttribute(
											"data-selected",
											button.getAttribute(
												"data-selected"
											) === "true"
												? "false"
												: "true"
										);
									}}
									type="button"
								>
									<i class="absolute top-[calc(50%_-_10px)] left-0 width-[20px] text-gray-500 fa-regular fa-square group-[:is([data-selected='true'])]/multiselect:hidden"></i>
									<i class="absolute top-[calc(50%_-_10px)] left-0 width-[20px] text-gray-500 fa-solid fa-square-check group-[:is([data-selected='false'])]/multiselect:hidden"></i>
									<p
										class="p-2 font-didact text-start"
										style={{ "grid-column": "2 / 3" }}
									>
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
					<CloseButton
						onClick={() => onFileRemove()}
						classes="text-lg w-[1.4rem] h-[1.4rem]"
					></CloseButton>
					<p>{value}</p>
				</div>
				<div
					data-name={name}
					onclick={onFileClick}
					class="peer peer-[:is(.show)]/file:hidden show group/file w-[90%] h-min my-3 py-3 justify-self-center self-center flex flex-col place-items-center font-didact border-dashed border-2 border-gray-600 rounded-md cursor-pointer hover:bg-gray-600 z-10"
				>
					<i
						class={
							"text-4xl text-gray-400 group-hover/file:text-gray-50 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.2)] " +
							(iconClasses || "")
						}
					></i>
					<p class="text-xl text-gray-400  group-hover/file:text-gray-50">
						Drag&Drop
					</p>
				</div>
				<input
					class="hidden"
					type="file"
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
			{/*--------------------------------MULTIFILE INPUT---------------------------------------- */}
			<Show when={type === "multifile"}>
				<div
					data-name={name}
					onclick={onFileClick}
					class="relative peer peer-[:is(.show)]/file:hidden show w-[95%] h-[85%] justify-self-center self-center font-didact border-dashed border-2 border-gray-600 rounded-md cursor-pointer z-10 overflow-y-auto"
				>
					<div
						id="multifileDropZone"
						class={
							"absolute inset-0 grid items-center" +
							((fileList().length > 0 && " -z-10 blur-[2px]") ||
								" hover:bg-gray-600 group/file")
						}
					>
						<div class="flex flex-col items-center z-[-1] group-hover/file:z-[0]">
							<i
								class={
									"text-5xl text-gray-400 group-hover/file:text-gray-50  " +
									(iconClasses || "")
								}
							></i>
							<p class="text-2xl text-gray-400  group-hover/file:text-gray-50">
								Drag&thinsp; & Drop
							</p>
						</div>
					</div>
					<div class="flex flex-row flex-wrap gap-4 p-4 self-start">
						<For each={fileList()}>
							{(fname, index) => (
								<div class="flex flex-row items-center h-min px-4 pl-3 py-1 gap-x-2 border-[2px] border-gray-600 rounded-lg bg-red-100 cursor-default">
									<CloseButton
										onClick={() => onFileRemove(index())}
										classes="text-lg w-[1.4rem] h-[1.4rem] mt-1 hover:bg-white"
									></CloseButton>
									<p>{fname}</p>
								</div>
							)}
						</For>
					</div>
				</div>
				<input
					class="hidden"
					type="file"
					name={name}
					required={required || false}
					readOnly={disabled || false}
					onchange={onFileChange}
					accept={fileExtension || undefined}
					multiple
				/>
				<style>
					{`.show {
						display: flex;
					}
					.unblur {
						filter: blur(0);
					}
					`}
				</style>
			</Show>
			{/*--------------------------------TEXTAREA INPUT---------------------------------------- */}
			<Show when={type === "textarea"}>
				<i
					class={
						"absolute w-min text-lg text-gray-500 top-[calc(50%_-_14px)] left-[1.5rem] z-20 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.2)] " +
						(iconClasses || "")
					}
				></i>
				<textarea
					class={
						"peer m-2 px-12 max-sm:pr-2 py-3 text-xl font-didact w-[calc(100%_-_1rem)] shadow-md shadow-gray-400 rounded-md focus:shadow-gray-500 focus:shadow-lg focus-visible:outline-none z-10" +
						(disabled && blurDisabled ? " blur-[1px]" : "")
					}
					name={name}
					placeholder={placeholder || ""}
					value={value === 0 ? "0" : value || ""}
					readOnly={disabled || false}
					onfocus={(e: FocusEvent) =>
						required &&
						(e.currentTarget as HTMLElement).removeAttribute(
							"required"
						)
					}
					onblur={(e: FocusEvent) =>
						required &&
						(e.currentTarget as HTMLInputElement).value === "" &&
						(e.currentTarget as HTMLElement).setAttribute(
							"required",
							""
						)
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
