import { For, createSignal, onMount } from "solid-js";
import { FileHandler } from "../../../lib/fileHandling.client";
import { CloseButton } from "../admin/table/CloseButton.solid";

export type MultiFileInputProps = {
	name: string;
	prefix: string;
	// value: [filename, metadata per file][]
	value?: [string, Record<string, any>][];
	required?: boolean;
	iconClasses?: string;
	disabled?: boolean;
	fileExtension?: string;
	// Metadata for new files
	metadata?: Record<string, any>[];
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
	} = props;

	const [input, setInput] = createSignal<HTMLInputElement>();
	const [fileList, setFileList] = createSignal<typeof initFiles>(initFiles); // Need to be a signal to update the component
	const fileHandler = new FileHandler(prefix + name, {
		isSingleFile: false,
		files: initFiles.map(([name, metadata]) => FileHandler.createFileProxy(name, { metadata })),
		metadata: metadata || {},
	});
	const setFiles = () => {
		setFileList(fileHandler.getFiles().map((f) => [f.name, f.metadata]) as typeof initFiles);
	};

	const onFileClick = (e: MouseEvent) => {
		e.stopPropagation();
		e.preventDefault();
		input()?.click();
	};
	const onFileChange = async (e: Event) => {
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
				<div class="flex flex-row flex-wrap gap-4 p-4 self-start">
					<For each={fileList()}>
						{([fname, _], index) => (
							<div
								style={{ "word-break": "break-all" }}
								class="flex flex-row items-center h-min w-[25ch] px-4 pl-3 py-1 gap-x-2 border-[2px] border-gray-600 rounded-lg bg-red-100 cursor-default">
								<CloseButton
									onClick={() => onFileRemove(index())}
									classes="text-lg hover:text-red-800 hover:bg-transparent"></CloseButton>
								<p>
									{fname.length > 20
										? fname.slice(0, 12) + " ... " + fname.slice(-7)
										: fname}
								</p>
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
