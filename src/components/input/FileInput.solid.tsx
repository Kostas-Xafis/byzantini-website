import { createSignal } from "solid-js";
import { FileHandler } from "../../../lib/fileHandling.client";
import { CloseButton } from "../admin/table/CloseButton.solid";

export type FileInputProps = {
	name: string;
	prefix: string;
	value?: [string, Record<string, any>] | [];
	required?: boolean;
	iconClasses?: string;
	disabled?: boolean;
	fileExtension?: string;
	metadata?: Record<string, any>;
};

export default function FileInput(props: FileInputProps) {
	const { name, prefix, value, required, iconClasses, disabled, fileExtension, metadata } = props;
	const [input, setInput] = createSignal<HTMLInputElement>();
	const [filename, setFilename] = createSignal<string>((value && value[0]) || "");
	const fileHandler = new FileHandler(prefix + name, {
		isSingleFile: true,
		file: value ? FileHandler.createFileProxy(value[0], { metadata: value[1] }) : undefined,
		metadata: metadata || {},
	});
	const onFileClick = (e: MouseEvent) => {
		let inp = input();
		if (inp) inp.click();
	};
	const onFileChange = (e: Event) => {
		const files = input()?.files;
		if (!files) return;

		fileHandler.addFiles([files[0]]);
		setFilename(files[0].name);
	};

	const onFileRemove = () => {
		let inp = input();
		if (!inp) return;
		inp.value = "";
		fileHandler.removeFile(0);
		setFilename("");
	};

	document.addEventListener("modal_close", (e) => {
		const modalPrefix = e.detail.prefix;
		if (modalPrefix !== prefix) return;
		if (prefix.includes("ADD")) {
			fileHandler.removeFile(0);
			setFilename("");
		}
	});

	return (
		<>
			<div
				data-file={name}
				class={
					"peer/file group/file hidden w-[90%] max-w-[30ch] h-min my-3 py-3 justify-self-center self-center flex-col place-items-center font-didact border-dashed border-2 border-gray-600 rounded-md overflow-x-hidden z-10" +
					(filename()?.length ? " show" : "")
				}>
				<CloseButton
					onClick={() => onFileRemove()}
					classes="text-lg w-[1.4rem] h-[1.4rem]"></CloseButton>
				<p>
					{(filename().length > 20
						? filename().slice(0, 12) + " ... " + filename().slice(-7)
						: filename()) || ""}
				</p>
			</div>
			<div
				data-name={name}
				onclick={onFileClick}
				class="peer peer-[:is(.show)]/file:hidden show group/file w-[90%] h-min my-3 py-3 justify-self-center self-center flex flex-col place-items-center font-didact border-dashed border-2 border-gray-600 rounded-md cursor-pointer hover:bg-gray-600 z-10">
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
		</>
	);
}
