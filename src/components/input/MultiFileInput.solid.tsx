import { For, createSignal, onMount } from "solid-js";
import { FileHandler, type FileProxy } from "../../../lib/fileHandling.client";
import type { AnyRecord, DOMElement } from "../../../types/global";
import { CloseButton } from "../admin/table/CloseButton.solid";

export type MultiFileInputProps = {
	name: string;
	prefix: string;
	// value: [filename, metadata per file][]
	value?: [string, AnyRecord][];
	required?: boolean;
	iconClasses?: string;
	disabled?: boolean;
	fileExtension?: string;
	// Metadata for new files
	metadata?: AnyRecord[];
	filePreview?: (file: FileProxy<AnyRecord>) => DOMElement;
};

export default function MultiFileInput(props: MultiFileInputProps) {
	const {
		name,
		value: initFiles = [],
		prefix,
		required,
		iconClasses,
		disabled,
		fileExtension,
		metadata,
		filePreview,
	} = props;

	const [input, setInput] = createSignal<HTMLInputElement>();
	const fileHandler = new FileHandler(prefix + name, {
		isSingleFile: false,
		files: initFiles.map(([name, metadata]) => FileHandler.createFileProxy(name, { metadata })),
		metadata: metadata || {},
	});
	const [fileList, setFileList] = createSignal(
		fileHandler.getFiles().map((f) => [f, f.getMetadata()])
	); // Need to be a signal to update the component
	const setFiles = () => {
		setFileList(fileHandler.getFiles().map((f) => [f, f.getMetadata()]));
	};

	const onFileClick = (e: MouseEvent) => {
		e.stopPropagation();
		e.preventDefault();
		if (
			e.target === document.querySelector(`[data-name='${name}'] > .fileContainer`) ||
			e.target === document.querySelector("#multifileDropZone")
		)
			input()?.click();
	};
	const onFileChange = async (_: Event) => {
		const files = input()?.files;
		if (!files) return;
		fileHandler.addFiles(files);
		setFiles();
	};
	const onFileRemove = (fileId: number = 0) => {
		fileHandler.removeFile(fileId);
		setFiles();
	};
	onMount(() => {
		const fileDiv = document.querySelector("#multifileDropZone") as HTMLElement;
		fileHandler.mountDragAndDrop(fileDiv, {
			enterEvent: (e) => {
				fileDiv.classList.add("bg-gray-600", "z-10", "unblur");
			},
			leaveEvent: (e) => {
				fileDiv.classList.remove("bg-gray-600", "z-10", "unblur");
			},
			dropEvent: (e) => {
				fileDiv.classList.remove("bg-gray-600", "z-10", "unblur");
				setFiles();
			},
		});
	});

	document.addEventListener("modal_close", (e) => {
		const modalPrefix = e.detail.prefix;
		if (modalPrefix !== prefix) return;
		if (prefix.includes("ADD")) {
			fileHandler.removeFile(0);
			setFileList([]);
		}
	});

	return (
		<>
			<div
				data-name={name}
				onclick={onFileClick}
				class="relative peer peer-[:is(.show)]/file:hidden show w-[95%] h-[85%] justify-self-center self-center font-didact border-dashed border-2 border-gray-600 rounded-md cursor-pointer z-10 overflow-y-auto">
				<div
					id="multifileDropZone"
					class={
						"absolute inset-0 grid items-center" +
						((fileList().length > 0 && " -z-10 blur-[2px]") ||
							" hover:bg-gray-600 group/file")
					}>
					<div class="flex flex-col items-center z-[-1] group-hover/file:z-[0]">
						<i
							class={
								"text-5xl text-gray-400 group-hover/file:text-gray-50  " +
								(iconClasses || "")
							}></i>
						<p class="text-2xl text-gray-400  group-hover/file:text-gray-50">
							Drag&thinsp; & Drop
						</p>
					</div>
				</div>
				<div class="fileContainer flex flex-row flex-wrap w-full justify-evenly gap-2 gap-y-4 p-2 self-start">
					<For each={fileList()}>
						{([file, _], index) => (
							<div
								style={{ "word-break": "break-all" }}
								class="relative flex flex-row items-end h-[250px] w-[275px] gap-x-2 border-[2px] border-gray-600 rounded-lg cursor-default overflow-hidden">
								{filePreview && (
									<div class="absolute flex -z-10 inset-0 w-full h-full place-self-center rounded-md overflow-hidden">
										{filePreview(file as FileProxy<AnyRecord>)}
									</div>
								)}

								<div class="flex flex-col h-max pb-2 items-center w-full rounded-b-[0.575rem]  bg-[rgb(255,255,255,0.55)] backdrop-blur-[3px]">
									<p>
										{(file.getName().length > 20
											? file.getName().slice(0, 12) +
											  " ... " +
											  file.getName().slice(-7)
											: file.getName()) || ""}
									</p>
									<CloseButton
										onClick={() => onFileRemove(index())}
										classes="text-lg w-[1.4rem] h-[1.4rem]"></CloseButton>
								</div>
							</div>
						)}
					</For>
				</div>
			</div>
			<input
				ref={(el) => setInput(el)}
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
		</>
	);
}
