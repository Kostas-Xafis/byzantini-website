import type { AnyRecord, DOMElement } from "@_types/global";
import { FileHandler, type FileProxy } from "@lib/fileHandling.client";
import { Show, createSignal, onCleanup } from "solid-js";
import Icon from "@components/other/Icon.solid";
import type { IconName } from "@lib/icons";
import { toast } from "../admin/toast";
import { acceptHint, shortName } from "./fileNames";

export type FileInputProps = {
	name: string;
	prefix: string;
	value?: [string, AnyRecord] | [];
	required?: boolean;
	icon?: IconName;
	disabled?: boolean;
	fileExtension?: string;
	metadata?: AnyRecord;
	filePreview?: (file: FileProxy<AnyRecord>) => DOMElement;
};

/**
 * Single-file field of the admin modals. The files live in a `FileHandler` registered as `prefix + name`; the modal's
 * submit reads it (`FileHandler.getHandler`) to upload the new file (the upload route itself deletes the file it
 * replaces, once the new one is stored) and to delete a removed stored file (`getRemovedFiles`).
 * The dialog unmounts its content when it closes, so every opening starts from the stored value again.
 */
export default function FileInput(props: FileInputProps) {
	const { name, prefix, value, required, icon, disabled, fileExtension, metadata, filePreview } = props;
	let input!: HTMLInputElement;
	const fileHandler = new FileHandler(prefix + name, {
		isSingleFile: true,
		file: value && value[0] ? FileHandler.createFileProxy(value[0], { metadata: value[1] }) : undefined,
		metadata: metadata || {},
	});
	onCleanup(() => fileHandler.unregister());

	const [file, setFile] = createSignal<FileProxy<AnyRecord> | null>(fileHandler.getFile(0));
	const [dragging, setDragging] = createSignal(false);

	const pick = () => !disabled && input.click();
	const accept = (files: FileList | File[] | null | undefined) => {
		const picked = files?.[0];
		if (!picked) return;
		if (!FileHandler.accepts(picked, fileExtension)) {
			toast.warning(`Το «${picked.name}» δεν είναι αποδεκτός τύπος αρχείου (${acceptHint(fileExtension)}).`, { title: "Μη αποδεκτό αρχείο" });
			return;
		}
		fileHandler.addFiles([picked]);
		setFile(fileHandler.getFile(0));
	};
	const onRemove = () => {
		input.value = "";
		fileHandler.removeFile(0);
		setFile(null);
	};

	// Counts nested enter/leave pairs so the highlight does not flicker over the children.
	let depth = 0;
	const dropHandlers = {
		onDragEnter: (e: DragEvent) => {
			if (disabled || !e.dataTransfer?.types.includes("Files")) return;
			e.preventDefault();
			depth++;
			setDragging(true);
		},
		onDragOver: (e: DragEvent) => {
			if (disabled || !e.dataTransfer?.types.includes("Files")) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = "copy";
		},
		onDragLeave: () => {
			depth = Math.max(0, depth - 1);
			if (depth === 0) setDragging(false);
		},
		onDrop: (e: DragEvent) => {
			e.preventDefault();
			depth = 0;
			setDragging(false);
			if (!disabled) accept(e.dataTransfer?.files);
		},
	};

	return (
		<div
			data-file={name}
			{...dropHandlers}
			class={
				"file-field relative z-10 m-2 flex h-56 flex-col overflow-hidden rounded-lg border-2 border-dashed transition-colors " +
				(dragging() ? "border-accent-ink bg-accent-soft" : file() ? "border-transparent" : "border-line hover:border-accent-ink/60")
			}>
			<Show
				when={file()}
				fallback={
					<button
						type="button"
						onClick={pick}
						disabled={disabled}
						class="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center font-didact text-ink-muted focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent-ink">
						<Icon name={icon ?? "file-image"} class="text-4xl opacity-70" />
						<span class="text-base leading-snug">
							Σύρετε το αρχείο εδώ ή <span class="font-semibold text-accent-ink underline underline-offset-2">επιλέξτε</span>
						</span>
						<Show when={fileExtension}>
							<span class="text-xs opacity-80">{acceptHint(fileExtension)}</span>
						</Show>
					</button>
				}>
				{(current) => (
					<>
						<div class="relative min-h-0 flex-1 overflow-hidden rounded-t-md bg-surface-muted">
							{filePreview ? (
								filePreview(current())
							) : (
								<div class="grid h-full place-items-center text-ink-muted">
									<Icon name="file-text" class="text-5xl opacity-60" />
								</div>
							)}
							<Show when={!current().isProxy()}>
								<span class="absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-brand-ink shadow-sm">Νέο</span>
							</Show>
						</div>
						<div class="flex items-center gap-1 rounded-b-md border border-t-0 border-line bg-surface px-2 py-1.5 font-didact">
							<p class="min-w-0 flex-1 truncate text-sm text-ink" title={current().getName()}>
								{shortName(current().getName())}
							</p>
							<button
								type="button"
								onClick={pick}
								disabled={disabled}
								title="Αντικατάσταση"
								aria-label="Αντικατάσταση αρχείου"
								class="grid size-8 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-ink">
								<Icon name="edit" />
							</button>
							<button
								type="button"
								onClick={onRemove}
								disabled={disabled}
								title="Αφαίρεση"
								aria-label="Αφαίρεση αρχείου"
								class="grid size-8 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-red-600/10 hover:text-danger focus-visible:outline-2 focus-visible:outline-accent-ink">
								<Icon name="trash" />
							</button>
						</div>
					</>
				)}
			</Show>
			<Show when={dragging()}>
				<div class="pointer-events-none absolute inset-0 grid place-items-center bg-accent-soft/90 font-didact text-lg font-semibold text-accent-ink">
					Αφήστε το αρχείο εδώ
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
					accept(input.files);
					// Cleared so choosing the same file again still fires `change`; the file itself lives in the handler.
					input.value = "";
				}}
				accept={fileExtension || undefined}
			/>
		</div>
	);
}
