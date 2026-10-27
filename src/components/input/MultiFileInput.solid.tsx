import { For, Show, createSignal, onCleanup } from "solid-js";
import Icon from "@components/other/Icon.solid";
import type { IconName } from "@lib/icons";
import { FileHandler, type FileProxy } from "@lib/fileHandling.client";
import type { AnyRecord, DOMElement } from "@_types/global";
import { toast } from "../admin/toast";
import { acceptHint, shortName } from "./fileNames";

export type MultiFileInputProps = {
	name: string;
	prefix: string;
	value?: [string, AnyRecord][];
	required?: boolean;
	icon?: IconName;
	disabled?: boolean;
	fileExtension?: string;
	metadata?: AnyRecord[];
	filePreview?: (file: FileProxy<AnyRecord>) => DOMElement;
};

/**
 * Multi-file field of the admin modals (announcement photos). Same contract as `FileInput`: the files live in the
 * `FileHandler` registered as `prefix + name`; the modal's submit uploads `getNewFiles()` first and only then deletes
 * `getRemovedFiles()`, so a failed upload never costs a stored file.
 */
export default function MultiFileInput(props: MultiFileInputProps) {
	const { name, value: initFiles = [], prefix, required, icon, disabled, fileExtension, metadata, filePreview } = props;
	let input!: HTMLInputElement;

	const fileHandler = new FileHandler(prefix + name, {
		isSingleFile: false,
		files: initFiles.map(([name, metadata]) => FileHandler.createFileProxy(name, { metadata })),
		metadata: metadata || {},
	});
	onCleanup(() => fileHandler.unregister());

	// A fresh array on every change so <For> re-renders (the handler mutates its own list).
	const [files, setFiles] = createSignal<FileProxy<AnyRecord>[]>(fileHandler.getFiles().slice());
	const sync = () => setFiles(fileHandler.getFiles().slice());
	const [dragging, setDragging] = createSignal(false);

	const pick = () => !disabled && input.click();
	const add = (list: FileList | null | undefined) => {
		if (!list?.length) return;
		const all = Array.from(list);
		const ok = all.filter((f) => FileHandler.accepts(f, fileExtension));
		const rejected = all.length - ok.length;
		if (rejected)
			toast.warning(
				rejected === 1 ? `Ένα αρχείο δεν είναι αποδεκτού τύπου (${acceptHint(fileExtension)}).` : `${rejected} αρχεία δεν είναι αποδεκτού τύπου.`,
				{
					title: "Μη αποδεκτά αρχεία",
				},
			);
		fileHandler.addFiles(ok);
		sync();
	};
	const remove = (index: number) => {
		fileHandler.removeFile(index);
		sync();
	};

	let depth = 0;
	const hasFiles = (e: DragEvent) => !disabled && !!e.dataTransfer?.types.includes("Files");

	return (
		<div
			data-name={name}
			onDragEnter={(e) => {
				if (!hasFiles(e)) return;
				e.preventDefault();
				depth++;
				setDragging(true);
			}}
			onDragOver={(e) => {
				if (!hasFiles(e)) return;
				e.preventDefault();
				e.dataTransfer!.dropEffect = "copy";
			}}
			onDragLeave={() => {
				depth = Math.max(0, depth - 1);
				if (depth === 0) setDragging(false);
			}}
			onDrop={(e) => {
				e.preventDefault();
				depth = 0;
				setDragging(false);
				if (!disabled) add(e.dataTransfer?.files);
			}}
			class={
				"file-field relative z-10 m-2 min-h-56 max-h-112 overflow-y-auto rounded-lg border-2 border-dashed p-3 transition-colors " +
				(dragging() ? "border-accent-ink bg-accent-soft" : "border-line")
			}>
			<Show when={files().length > 0}>
				<p class="mb-2 font-didact text-sm text-ink-muted">
					{files().length === 1 ? "1 αρχείο" : `${files().length} αρχεία`}
					<Show when={files().some((f) => !f.isProxy())}> · {files().filter((f) => !f.isProxy()).length} νέα</Show>
				</p>
			</Show>
			<ul class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
				<For each={files()}>
					{(file, index) => (
						<li class="group/tile relative flex h-44 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
							<div class="relative min-h-0 flex-1 bg-surface-muted">
								{filePreview ? (
									filePreview(file)
								) : (
									<div class="grid h-full place-items-center text-ink-muted">
										<Icon name="file-image" class="text-4xl opacity-60" />
									</div>
								)}
								<Show when={!file.isProxy()}>
									<span class="absolute left-1.5 top-1.5 rounded-full bg-brand px-1.5 py-px text-2xs font-semibold text-brand-ink">Νέο</span>
								</Show>
								<button
									type="button"
									onClick={() => remove(index())}
									disabled={disabled}
									title="Αφαίρεση"
									aria-label={`Αφαίρεση ${file.getName()}`}
									class="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/55 text-white opacity-0 shadow transition-opacity group-hover/tile:opacity-100 focus-visible:opacity-100 hover:bg-red-700 max-sm:opacity-100">
									<Icon name="close" class="text-sm" />
								</button>
							</div>
							<p class="truncate px-2 py-1 font-didact text-xs text-ink" title={file.getName()}>
								{shortName(file.getName(), 22)}
							</p>
						</li>
					)}
				</For>
				<li>
					<button
						type="button"
						onClick={pick}
						disabled={disabled}
						class={
							"flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-3 text-center font-didact text-ink-muted transition-colors hover:border-accent-ink/60 hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-accent-ink " +
							(files().length ? "h-44" : "h-48")
						}>
						<Icon name={files().length ? "plus" : (icon ?? "images")} class="text-3xl opacity-70" />
						<span class="text-sm leading-snug">{files().length ? "Προσθήκη αρχείων" : "Σύρετε αρχεία εδώ ή επιλέξτε"}</span>
						<Show when={fileExtension}>
							<span class="text-xs opacity-80">{acceptHint(fileExtension)}</span>
						</Show>
					</button>
				</li>
			</ul>
			<Show when={dragging()}>
				<div class="pointer-events-none absolute inset-0 grid place-items-center bg-accent-soft/90 font-didact text-lg font-semibold text-accent-ink">
					Αφήστε τα αρχεία εδώ
				</div>
			</Show>
			<input
				ref={input}
				class="hidden"
				type="file"
				name={name}
				required={required || false}
				disabled={disabled || false}
				onChange={() => {
					add(input.files);
					input.value = "";
				}}
				accept={fileExtension || undefined}
				multiple
			/>
		</div>
	);
}
