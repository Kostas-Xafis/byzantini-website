import { createSignal } from "solid-js";
import { FileHandler } from "../../../lib/fileHandling.client";
import { CloseButton } from "../admin/table/CloseButton.solid";

export type FileInputProps = {
	name: string;
	prefix: string;
	value?: string | number;
	required?: boolean;
	iconClasses?: string;
	disabled?: boolean;
	fileExtension?: string;
};

export default function FileInput(props: FileInputProps) {
	const { name, prefix, value, required, iconClasses, disabled, fileExtension } = props;
	const [filename, setFilename] = createSignal<string>((value as string) || "", {
		equals: false,
	});
	const fileHandler = new FileHandler(prefix + name, {
		isSingleFile: true,
		file: value ? FileHandler.createFileProxy(value as string) : undefined,
	});
	const onFileClick = (e: MouseEvent) => {
		const input = document.querySelector<HTMLInputElement>(
			`form[data-prefix=${prefix}] input[name='${name}']`
		);
		if (input) input.click();
	};
	const onFileChange = (e: Event) => {
		const input = e.currentTarget as HTMLInputElement;
		const files = input?.files;
		if (!files) return;

		fileHandler.addFiles([files[0]]);
		setFilename(files[0].name);
	};

	const onFileRemove = () => {
		const input = document.querySelector<HTMLInputElement>(
			`form[data-prefix=${prefix}] input[name='${name}']`
		);
		if (!input) return;

		input.value = "";
		fileHandler.removeFile(0);
		setFilename("");
	};

	document.addEventListener("ModalClose", (e) => {
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
				<p>{filename()}</p>
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
