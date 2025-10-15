import type { AnyRecord, DOMElement } from "@_types/global";
import { FileHandler, type FileProxy } from "@lib/fileHandling.client";
import { createMemo, createSignal } from "solid-js";
import { CloseButton } from "../admin/table/CloseButton.solid";

export type FileInputProps = {
	name: string;
	prefix: string;
	value?: [string, AnyRecord] | [];
	required?: boolean;
	iconClasses?: string;
	disabled?: boolean;
	fileExtension?: string;
	metadata?: AnyRecord;
	filePreview?: (file: FileProxy<AnyRecord>) => DOMElement;
};

export default function FileInput(props: FileInputProps) {
	const {
		name,
		prefix,
		value,
		required,
		iconClasses,
		disabled,
		fileExtension,
		metadata,
		filePreview,
	} = props;
	const [input, setInput] = createSignal<HTMLInputElement>();
	const fileHandler = new FileHandler(prefix + name, {
		isSingleFile: true,
		file: value ? FileHandler.createFileProxy(value[0], { metadata: value[1] }) : undefined,
		metadata: metadata || {},
	});
	const [file, setFile] = createSignal<FileProxy<AnyRecord> | null>(fileHandler.getFile(0));
	const onFileClick = (e: MouseEvent) => {
		let inp = input();
		if (inp) inp.click();
	};
	const onFileChange = (e: Event) => {
		const files = input()?.files;
		if (!files) return;

		fileHandler.addFiles([files[0]]);
		setFile(fileHandler.getFile(0));
	};

	const onFileRemove = () => {
		let inp = input();
		if (!inp) return;
		inp.value = "";
		fileHandler.removeFile(0);
		setFile(null);
	};

	document.addEventListener("modal_close", (e) => {
		const modalPrefix = e.detail.prefix;
		if (modalPrefix !== prefix) return;
		if (prefix.includes("ADD")) {
			fileHandler.removeFile(0);
			setFile(null);
		}
	});

	const fname = createMemo(() => file()?.getName() || "");

	return (
		<>
			<div class="flex justify-center">
				<div
					data-file={name}
					class={
						" relative peer/file group/file hidden w-[90%] max-w-[30ch] h-[90%] my-3 justify-self-center self-center flex-col items-center justify-end font-didact bg-transparent border-dashed border-2 border-gray-600 rounded-md overflow-x-hidden z-10" +
						(fname().length ? " show" : "")
					}>
					{filePreview && file() && (
						<div class="absolute flex -z-10 inset-0 w-[95%] h-[95%] place-self-center rounded-md overflow-hidden">
							{filePreview(file() as any)}
						</div>
					)}
					<div class="flex flex-col h-max pb-2 items-center w-full bg-[rgb(255,255,255,0.55)] backdrop-blur-[3px]">
						<p>
							{((fname() || "").length > 20
								? fname().slice(0, 12) + " ... " + fname().slice(-7)
								: fname()) || ""}
						</p>
						<CloseButton
							onClick={() => onFileRemove()}
							classes="text-lg w-[1.4rem] h-[1.4rem]"></CloseButton>
					</div>
				</div>
				<div
					data-name={name}
					onclick={onFileClick}
					class="peer peer-[:is(.show)]/file:hidden show group/file w-[90%] h-[90%] my-3 py-3 justify-self-center self-center flex flex-col justify-center items-center font-didact border-dashed border-2 border-gray-600 rounded-md cursor-pointer hover:bg-gray-600 z-10">
					<i
						class={
							"text-4xl text-gray-400 group-hover/file:text-gray-50 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.2)] " +
							(iconClasses || "")
						}></i>
					<p class="text-xl text-gray-400  group-hover/file:text-gray-50">Drag&Drop</p>
				</div>
				<input
					ref={setInput}
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
			</div>
		</>
	);
}
