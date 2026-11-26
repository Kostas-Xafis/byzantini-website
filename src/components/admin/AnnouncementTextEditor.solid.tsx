import { announcementHtml } from "@lib/announcements/format";
import { insertLink, toggleLines, toggleWrap, type TextEdit } from "@lib/announcements/editing";
import type { IconName } from "@lib/icons";
import { For, Show, createMemo, createSignal } from "solid-js";
import Icon from "../other/Icon.solid";

/**
 * The «Περιεχόμενο» field of an announcement: a plain textarea (the form still reads `name`) with a toolbar for
 * the marks of lib/announcements/format.ts — bold, italic, headings, lists, links — and a preview that renders
 * the text exactly like the public page. Keyboard: Ctrl/⌘+B, Ctrl/⌘+I, Ctrl/⌘+K.
 */

type Props = { name: string; label: string; value?: string };

type Tool = { icon: IconName; label: string; keys?: string; run: (value: string, start: number, end: number) => TextEdit };

const TOOLS: Tool[] = [
	{ icon: "bold", label: "Έντονα", keys: "Ctrl+B", run: (v, s, e) => toggleWrap(v, s, e, "**", "έντονο κείμενο") },
	{ icon: "italic", label: "Πλάγια", keys: "Ctrl+I", run: (v, s, e) => toggleWrap(v, s, e, "*", "πλάγιο κείμενο") },
	{ icon: "heading", label: "Επικεφαλίδα", run: (v, s, e) => toggleLines(v, s, e, "h2") },
	{ icon: "list", label: "Λίστα με κουκκίδες", run: (v, s, e) => toggleLines(v, s, e, "ul") },
	{ icon: "list-ordered", label: "Αριθμημένη λίστα", run: (v, s, e) => toggleLines(v, s, e, "ol") },
	{ icon: "link", label: "Σύνδεσμος", keys: "Ctrl+K", run: (v, s, e) => insertLink(v, s, e, "κείμενο συνδέσμου") },
];
const SHORTCUTS: Record<string, Tool> = { b: TOOLS[0], i: TOOLS[1], k: TOOLS[5] };

// `execCommand` is deprecated but still the only way an edit lands on the textarea's undo stack.
type LegacyEditing = { execCommand?: (command: string, showUI: boolean, value: string) => boolean };

let uidSeq = 0;

export default function AnnouncementTextEditor(props: Props) {
	let textarea!: HTMLTextAreaElement;
	const uid = `announcement-text-${++uidSeq}`;
	const [text, setText] = createSignal(props.value ?? "");
	const [preview, setPreview] = createSignal(false);
	const previewHtml = createMemo(() => (preview() ? announcementHtml(text()) : ""));

	const apply = (tool: Tool) => {
		if (preview()) setPreview(false);
		const edit = tool.run(textarea.value, textarea.selectionStart, textarea.selectionEnd);
		textarea.focus();
		textarea.setSelectionRange(edit.from, edit.to);
		// execCommand keeps the edit on the browser's undo stack (Ctrl+Z) and fires `input` like typing does;
		// setRangeText is the fallback where it is not supported.
		const done = (document as LegacyEditing).execCommand?.("insertText", false, edit.insert);
		if (!done || textarea.value.slice(edit.from, edit.from + edit.insert.length) !== edit.insert) {
			textarea.setRangeText(edit.insert, edit.from, edit.to);
			textarea.dispatchEvent(new Event("input", { bubbles: true }));
		}
		textarea.setSelectionRange(edit.selStart, edit.selEnd);
		setText(textarea.value);
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
		const tool = SHORTCUTS[e.key.toLowerCase()];
		if (!tool) return;
		e.preventDefault();
		apply(tool);
	};

	const tabClass = (active: boolean) =>
		"rounded-md px-3 py-1 text-base transition-colors focus-visible:outline-2 focus-visible:outline-accent-ink " +
		(active ? "bg-brand text-brand-ink" : "text-ink-muted hover:bg-ink/10 hover:text-ink");

	return (
		<div class="col-span-full grid gap-y-2 font-didact text-ink" role="group" aria-labelledby={uid + "-label"}>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<span id={uid + "-label"} class="text-lg">
					{props.label}
				</span>
				<div class="flex gap-1" role="tablist" aria-label="Προβολή">
					<button type="button" role="tab" aria-selected={!preview()} class={tabClass(!preview())} onClick={() => setPreview(false)}>
						Επεξεργασία
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={preview()}
						class={tabClass(preview())}
						onClick={() => {
							setText(textarea.value);
							setPreview(true);
						}}>
						Προεπισκόπηση
					</button>
				</div>
			</div>
			<div class="overflow-hidden rounded-md border-2 border-ink-muted bg-surface shadow-md shadow-shade focus-within:border-accent-ink">
				<div
					class="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface-muted px-1.5 py-1"
					role="toolbar"
					aria-label="Μορφοποίηση κειμένου">
					<For each={TOOLS}>
						{(tool) => (
							<button
								type="button"
								title={tool.keys ? `${tool.label} (${tool.keys})` : tool.label}
								aria-label={tool.label}
								// Keep the textarea's selection: a mousedown on the button would move the focus first.
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => apply(tool)}
								class="grid size-9 place-items-center rounded-md text-lg text-ink-muted transition-colors hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-ink">
								<Icon name={tool.icon} />
							</button>
						)}
					</For>
				</div>
				<textarea
					ref={textarea}
					name={props.name}
					aria-labelledby={uid + "-label"}
					aria-describedby={uid + "-help"}
					value={props.value ?? ""}
					hidden={preview()}
					onInput={(e) => setText(e.currentTarget.value)}
					onKeyDown={onKeyDown}
					class="block h-80 w-full resize-y bg-surface px-4 py-3 font-didact text-lg leading-relaxed text-ink focus-visible:outline-hidden"
				/>
				<Show when={preview()}>
					<div class="h-80 resize-y overflow-y-auto bg-surface px-5 py-4 text-lg leading-[1.8]">
						<Show when={text().trim()} fallback={<p class="text-ink-muted">Δεν υπάρχει κείμενο.</p>}>
							<div class="announcement-text" innerHTML={previewHtml()} />
						</Show>
					</div>
				</Show>
			</div>
			<p id={uid + "-help"} class="text-sm text-ink-muted leading-snug">
				Κάθε γραμμή είναι μια παράγραφος. Λίστα: γραμμές που ξεκινούν με «- » ή «1. ». Επικεφαλίδα: «## ». **έντονα**, *πλάγια*. Οι διευθύνσεις
				(https://…) και τα email γίνονται σύνδεσμοι μόνα τους.
			</p>
		</div>
	);
}
