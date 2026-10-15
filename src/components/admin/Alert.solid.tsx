import {
	EXIT_DURATION,
	MAX_VISIBLE,
	emptyToastState,
	findToast,
	reduceToasts,
	tickToasts,
	visibleToastIds,
	type Toast,
	type ToastCommand,
	type ToastState,
	type ToastType,
} from "@utilities/toastStore";
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { TOAST_EVENT, pushAlert, updateAlert } from "./toast";
import Icon from "@components/other/Icon.solid";
import type { IconName } from "@lib/icons";

// The public API lives in ./toast.ts (plain TS, usable from non-component modules); this path keeps
// exporting it for the existing `import { createAlert, pushAlert } from "./Alert.solid"` call sites.
export { createAlert, pushAlert, toast, updateAlert, type Alert, type ProgressHandle, type ToastHandle, type ToastOptions } from "./toast";

const TICK_MS = 100;

const TYPE_STYLES: Record<ToastType, { icon: IconName; spin?: boolean; card: string; icon_color: string; bar: string; label: string }> = {
	success: {
		icon: "check-circle",
		card: "bg-green-50 text-green-950 border-green-700/25 border-l-green-700 dark:bg-green-950 dark:text-green-50 dark:border-green-300/25 dark:border-l-green-400",
		icon_color: "text-green-700 dark:text-green-300",
		bar: "bg-green-700 dark:bg-green-400",
		label: "Επιτυχία",
	},
	info: {
		icon: "info",
		card: "bg-blue-50 text-blue-950 border-blue-700/25 border-l-blue-700 dark:bg-blue-950 dark:text-blue-50 dark:border-blue-300/25 dark:border-l-blue-400",
		icon_color: "text-blue-700 dark:text-blue-300",
		bar: "bg-blue-700 dark:bg-blue-400",
		label: "Ενημέρωση",
	},
	warning: {
		icon: "warning",
		card: "bg-amber-50 text-amber-950 border-amber-700/25 border-l-amber-600 dark:bg-amber-950 dark:text-amber-50 dark:border-amber-300/25 dark:border-l-amber-400",
		icon_color: "text-amber-700 dark:text-amber-300",
		bar: "bg-amber-600 dark:bg-amber-400",
		label: "Προειδοποίηση",
	},
	error: {
		icon: "alert-circle",
		card: "bg-red-50 text-red-950 border-red-700/25 border-l-red-700 dark:bg-red-950 dark:text-red-50 dark:border-red-300/25 dark:border-l-red-400",
		icon_color: "text-red-700 dark:text-red-300",
		bar: "bg-red-700 dark:bg-red-400",
		label: "Σφάλμα",
	},
	progress: {
		icon: "spinner",
		spin: true,
		card: "bg-surface text-ink border-line border-l-accent-ink",
		icon_color: "text-accent-ink",
		bar: "bg-accent-ink",
		label: "Σε εξέλιξη",
	},
};

// Animations live here (not in AdminLayout) so the component is self-contained. Reduced motion keeps
// only opacity fades; <Icon spin> already stops spinning under reduced motion.
const TOAST_CSS = `
.byz-toast { animation: byz-toast-in 220ms cubic-bezier(.21,1.02,.73,1) both; }
.byz-toast[data-state="closing"] { animation: byz-toast-out ${EXIT_DURATION}ms ease-in forwards; pointer-events: none; }
.byz-toast-indeterminate { animation: byz-toast-indeterminate 1.3s ease-in-out infinite; }
@keyframes byz-toast-in { from { opacity: 0; transform: translateY(.75rem) scale(.97); } to { opacity: 1; transform: none; } }
@keyframes byz-toast-out { to { opacity: 0; transform: translateX(1.5rem) scale(.97); } }
@keyframes byz-toast-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes byz-toast-fade-out { to { opacity: 0; } }
@keyframes byz-toast-indeterminate { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
@media (max-width: 639.98px) {
	@keyframes byz-toast-out { to { opacity: 0; transform: translateY(1rem); } }
}
@media (prefers-reduced-motion: reduce) {
	.byz-toast { animation-name: byz-toast-fade-in; }
	.byz-toast[data-state="closing"] { animation-name: byz-toast-fade-out; }
	.byz-toast-indeterminate { animation: none; width: 100%; opacity: .45; }
}
`;

/**
 * The admin toast stack (mounted once by AdminPage). Owns the toast state; everything else talks to
 * it through `toast.*` / `pushAlert` (./toast.ts), which dispatch `admin_toast` window events.
 */
export default function AlertStack() {
	const [state, setState] = createStore<ToastState>(emptyToastState());
	// Plain (non-proxy) mirror the pure reducers work on; the store is reconciled from it.
	let current: ToastState = emptyToastState();

	const [hovered, setHovered] = createSignal(false);
	const [focused, setFocused] = createSignal(false);
	const [expanded, setExpanded] = createSignal(false);
	const [politeText, setPoliteText] = createSignal("");
	const [assertiveText, setAssertiveText] = createSignal("");

	let listEl!: HTMLOListElement;
	let sectionEl!: HTMLElement;
	let returnFocusTo: HTMLElement | null = null;

	const maxVisible = () => (expanded() ? Infinity : MAX_VISIBLE);
	const apply = (next: ToastState) => {
		if (next === current) return;
		current = next;
		setState(reconcile(next, { key: "id", merge: true }));
	};

	const announce = (t: Toast) => {
		const text = [TYPE_STYLES[t.type].label, t.title, t.message].filter(Boolean).join(": ") + (t.count > 1 ? ` (×${t.count})` : "");
		const set = t.type === "error" ? setAssertiveText : setPoliteText;
		// Clear first so an identical message is announced again.
		set("");
		setTimeout(() => set(text), 50);
	};

	const run = (cmd: ToastCommand) => {
		const id = cmd.kind === "push" ? cmd.toast.id : cmd.id;
		// Snapshot before applying: reconcile mutates the store's (shared) objects in place.
		const found = id !== undefined ? findToast(current, id) : undefined;
		const prev = found && { message: found.message, title: found.title, type: found.type, count: found.count };
		apply(reduceToasts(current, cmd));
		if (cmd.kind !== "push" && cmd.kind !== "update") return;
		const next = findToast(current, id!);
		// Announce new toasts and text/type changes — not every progress counter tick.
		if (next && (!prev || prev.message !== next.message || prev.title !== next.title || prev.type !== next.type || prev.count !== next.count)) {
			announce(next);
		}
	};

	const onToast = (e: CustomEvent<ToastCommand>) => run(e.detail);
	// Legacy bridge: anything still dispatching the old events directly.
	const onLegacyPush = (e: CustomEvent<Parameters<typeof pushAlert>[0]>) => pushAlert(e.detail);
	const onLegacyUpdate = (e: CustomEvent<Parameters<typeof updateAlert>[0]>) => updateAlert(e.detail);
	window.addEventListener(TOAST_EVENT, onToast);
	window.addEventListener("push_alert", onLegacyPush);
	window.addEventListener("update_alert", onLegacyUpdate);

	let last = Date.now();
	const interval = setInterval(() => {
		const now = Date.now();
		const elapsed = now - last;
		last = now;
		if (current.toasts.length === 0) return;
		apply(tickToasts(current, elapsed, { paused: hovered() || focused() || document.hidden, maxVisible: maxVisible() }));
	}, TICK_MS);

	onCleanup(() => {
		window.removeEventListener(TOAST_EVENT, onToast);
		window.removeEventListener("push_alert", onLegacyPush);
		window.removeEventListener("update_alert", onLegacyUpdate);
		clearInterval(interval);
	});

	const visibleIds = createMemo(() => visibleToastIds(state, maxVisible()));
	const rendered = createMemo(() => state.toasts.filter((t) => visibleIds().has(t.id)));
	const openCount = createMemo(() => state.toasts.filter((t) => !t.closing).length);
	const hiddenCount = createMemo(() => state.toasts.filter((t) => !t.closing && !visibleIds().has(t.id)).length);

	createEffect(() => {
		if (rendered().length === 0) {
			// mouseleave/focusout never fire once the last toast is gone.
			setHovered(false);
			setFocused(false);
		}
		if (openCount() <= MAX_VISIBLE) setExpanded(false);
	});

	const closeButtons = () => Array.from(listEl?.querySelectorAll<HTMLButtonElement>("li:not([data-state=closing]) [data-toast-close]") ?? []);

	/** Dismiss a toast; if focus was inside it, hand it to a neighbouring toast or back to where it came from. */
	const close = (id: string) => {
		const li = listEl?.querySelector<HTMLLIElement>(`li[data-toast-id="${id}"]`);
		const hadFocus = !!li && li.contains(document.activeElement);
		run({ kind: "dismiss", id });
		if (!hadFocus) return;
		const others = closeButtons().filter((b) => !li!.contains(b));
		const target = others.at(-1);
		if (target) target.focus();
		else if (returnFocusTo?.isConnected) returnFocusTo.focus();
		else (document.activeElement as HTMLElement | null)?.blur();
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key !== "Escape") return;
		const newest = [...rendered()].reverse().find((t) => !t.closing);
		if (!newest) return;
		e.preventDefault();
		e.stopPropagation(); // don't also close a modal underneath
		const li = listEl.querySelector<HTMLLIElement>(`li[data-toast-id="${newest.id}"]`);
		if (li && !li.contains(document.activeElement)) {
			run({ kind: "dismiss", id: newest.id });
			return;
		}
		close(newest.id);
	};

	const onFocusIn = (e: FocusEvent) => {
		const from = e.relatedTarget as HTMLElement | null;
		if (from && !sectionEl.contains(from)) returnFocusTo = from;
		setFocused(true);
	};
	const onFocusOut = (e: FocusEvent) => {
		const to = e.relatedTarget as Node | null;
		if (!to || !sectionEl.contains(to)) setFocused(false);
	};

	return (
		<>
			<style>{TOAST_CSS}</style>
			{/* Screen-reader announcers: always mounted so the live regions exist before their text changes. */}
			<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
				{politeText()}
			</div>
			<div class="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
				{assertiveText()}
			</div>
			<section
				ref={sectionEl}
				aria-label="Ειδοποιήσεις"
				class="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[9999] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96 sm:items-end"
				onKeyDown={onKeyDown}
				onFocusIn={onFocusIn}
				onFocusOut={onFocusOut}>
				<Show when={hiddenCount() > 0 || expanded() || openCount() >= 3}>
					<div class="pointer-events-auto flex gap-2 self-end text-sm font-semibold">
						<Show when={hiddenCount() > 0 || expanded()}>
							<button
								type="button"
								aria-expanded={expanded()}
								onClick={() => setExpanded(!expanded())}
								class="rounded-full border border-line bg-surface px-3 py-1 text-ink shadow-md transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink">
								{expanded() ? "Σύμπτυξη" : `+${hiddenCount()} ακόμη`}
							</button>
						</Show>
						<Show when={openCount() >= 3}>
							<button
								type="button"
								onClick={() => run({ kind: "dismiss" })}
								class="rounded-full border border-line bg-surface px-3 py-1 text-ink shadow-md transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink">
								Κλείσιμο όλων
							</button>
						</Show>
					</div>
				</Show>
				<ol
					ref={listEl}
					class={
						"flex w-full flex-col gap-2" +
						(expanded() ? " pointer-events-auto max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain p-1 -m-1" : "")
					}
					onMouseEnter={() => setHovered(true)}
					onMouseLeave={() => setHovered(false)}>
					<For each={rendered()}>{(t) => <ToastCard toast={t} onClose={() => close(t.id)} />}</For>
				</ol>
			</section>
		</>
	);
}

function ToastCard(props: { toast: Toast; onClose: () => void }) {
	const t = () => props.toast;
	const styles = () => TYPE_STYLES[t().type];
	const timed = () => t().type !== "progress" && Number.isFinite(t().duration) && t().duration > 0;
	const titleId = `toast-title-${t().id}`;
	const messageId = `toast-message-${t().id}`;

	return (
		<li
			data-toast-id={t().id}
			data-state={t().closing ? "closing" : "open"}
			aria-labelledby={t().title ? titleId : undefined}
			aria-describedby={t().message ? messageId : undefined}
			class={
				"byz-toast pointer-events-auto relative w-full overflow-hidden rounded-lg border border-l-4 shadow-lg shadow-black/15 dark:shadow-black/50 " +
				styles().card
			}>
			<div class="flex items-start gap-3 py-3 pr-2 pl-3">
				<Icon name={styles().icon} spin={styles().spin} class={`${styles().icon_color} mt-[3px] shrink-0 text-lg`} />
				<div class="min-w-0 flex-1">
					<Show when={t().title}>
						<p id={titleId} class="text-current font-bold leading-6 break-words">
							{t().title}
						</p>
					</Show>
					<Show when={t().message}>
						<p id={messageId} class={"text-current text-[0.95rem] leading-6 break-words whitespace-pre-line" + (t().title ? "" : " font-medium")}>
							{t().message}
						</p>
					</Show>
					<Show when={t().progress}>{(p) => <ProgressBlock progress={p()} label={t().title || t().message} bar={styles().bar} />}</Show>
					<Show when={t().action}>
						{(action) => (
							<button
								type="button"
								onClick={() => {
									action().onClick();
									if (action().dismiss !== false) props.onClose();
								}}
								class="mt-2 rounded-md px-2.5 py-1 text-sm font-bold text-current ring-1 ring-current/40 transition-colors hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:hover:bg-white/10">
								{action().label}
							</button>
						)}
					</Show>
				</div>
				<Show when={t().count > 1}>
					<span
						class="mt-0.5 shrink-0 rounded-full bg-black/10 px-2 text-xs leading-5 font-bold tabular-nums dark:bg-white/15"
						title={`${t().count} φορές`}>
						×{t().count}
					</span>
				</Show>
				<button
					type="button"
					data-toast-close
					aria-label="Κλείσιμο"
					title="Κλείσιμο"
					onClick={() => props.onClose()}
					class="-my-1 grid size-8 text-current shrink-0 place-items-center rounded-md transition-colors hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current dark:hover:bg-white/10">
					<Icon name="close" />
				</button>
			</div>
			<Show when={timed()}>
				{/* Auto-dismiss countdown; freezes while the stack is hovered/focused. */}
				<div
					aria-hidden="true"
					class={
						"absolute inset-x-0 bottom-0 h-1 origin-left opacity-70 transition-transform duration-100 ease-linear motion-reduce:transition-none " +
						styles().bar
					}
					style={{ transform: `scaleX(${Math.max(0, Math.min(1, t().remaining / t().duration))})` }}
				/>
			</Show>
		</li>
	);
}

function ProgressBlock(props: { progress: NonNullable<Toast["progress"]>; label: string; bar: string }) {
	const total = () => props.progress.total;
	const done = () => props.progress.done;
	const determinate = () => total() !== undefined && total()! > 0 && done() !== undefined;
	const pct = () => (determinate() ? Math.min(100, Math.round((done()! / total()!) * 100)) : 0);

	return (
		<div class="mt-2">
			<div
				role="progressbar"
				aria-label={props.label}
				aria-valuemin={0}
				aria-valuemax={determinate() ? total() : undefined}
				aria-valuenow={determinate() ? done() : undefined}
				aria-valuetext={determinate() ? `${done()} / ${total()}` : undefined}
				class="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
				<Show when={determinate()} fallback={<div class={"byz-toast-indeterminate h-full w-2/5 rounded-full " + props.bar} />}>
					<div
						class={"h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none " + props.bar}
						style={{ width: `${pct()}%` }}
					/>
				</Show>
			</div>
			<Show when={determinate() || props.progress.detail}>
				<p class="text-current mt-1 flex justify-between gap-3 text-xs leading-5 font-semibold tabular-nums">
					<span>{determinate() ? `${done()} / ${total()}` : ""}</span>
					<span>{[determinate() ? `${pct()}%` : "", props.progress.detail].filter(Boolean).join(" · ")}</span>
				</p>
			</Show>
		</div>
	);
}
