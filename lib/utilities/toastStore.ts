/**
 * Framework-free toast state for the admin panel (`src/components/admin/Alert.solid.tsx` renders it).
 *
 * Everything here is pure: `reduceToasts` applies a command, `tickToasts` advances the timers by an
 * elapsed amount of milliseconds. The Solid stack keeps the state in a store and feeds both; the unit
 * tests (`tests/unit/toastStore.test.ts`) drive them directly.
 */

export type ToastType = "success" | "info" | "warning" | "error" | "progress";

export type ToastAction = {
	label: string;
	onClick: () => void;
	/** Dismiss the toast after the click (default `true`). */
	dismiss?: boolean;
};

export type ToastProgress = {
	/** Completed units; omit (together with `total`) for an indeterminate bar. */
	done?: number;
	/** Total units; unknown ⇒ indeterminate bar. */
	total?: number;
	/** Secondary text next to the counter, e.g. "12,4 MB". */
	detail?: string;
};

export type Toast = {
	id: string;
	/** Ids of identical toasts that were merged into this one (dedupe), so legacy `updateAlert` still finds it. */
	aliases: string[];
	type: ToastType;
	title?: string;
	message: string;
	/** How many identical toasts were merged into this one (shown as "×N" when > 1). */
	count: number;
	/** Total lifetime in ms; `Infinity` never expires. */
	duration: number;
	/** Lifetime left in ms (only counts down while the toast is visible and the stack is not paused). */
	remaining: number;
	/** Bumped whenever the timer restarts (dedupe / update), lets the view restart its countdown bar. */
	timerKey: number;
	action?: ToastAction;
	progress?: ToastProgress;
	/** Exit animation running; removed once `exitRemaining` reaches 0. */
	closing: boolean;
	exitRemaining: number;
};

export type ToastInit = {
	id: string;
	type: ToastType;
	message: string;
	title?: string;
	/** Defaults to `DEFAULT_DURATIONS[type]`. */
	duration?: number;
	action?: ToastAction;
	progress?: ToastProgress;
	/** Merge into an identical visible toast instead of stacking a copy (default `true`, never for progress/action toasts). */
	dedupe?: boolean;
};

export type ToastPatch = Partial<Pick<Toast, "type" | "title" | "message" | "duration">> & {
	/** `null` removes the action. */
	action?: ToastAction | null;
	/** Merged into the current progress; `null` removes the progress block. */
	progress?: ToastProgress | null;
	/** Restart the countdown (default: when the type or message changes). */
	restartTimer?: boolean;
};

export type ToastCommand =
	| { kind: "push"; toast: ToastInit }
	/** Patch a toast; when it is gone (closed by the user) and `fallback` is given, push that instead. */
	| { kind: "update"; id: string; patch: ToastPatch; fallback?: ToastInit }
	/** Start the exit animation of one toast, or of all of them without an id. */
	| { kind: "dismiss"; id?: string }
	/** Drop immediately, no exit animation. */
	| { kind: "remove"; id: string };

export type ToastState = { toasts: Toast[] };

export const DEFAULT_DURATIONS: Record<ToastType, number> = {
	success: 5000,
	info: 5000,
	warning: 8000,
	error: Infinity,
	progress: Infinity,
};

/** Exit animation length (keep in sync with the CSS in Alert.solid.tsx). */
export const EXIT_DURATION = 180;
export const MAX_VISIBLE = 5;

export const emptyToastState = (): ToastState => ({ toasts: [] });

/**
 * Builds a message out of mixed parts the way the legacy `createAlert` did: strings/numbers verbatim,
 * `Error`s by their `.message`, other objects as JSON.
 */
export function formatToastMessage(...parts: unknown[]): string {
	let msg = "";
	for (const part of parts) {
		if (part === undefined || part === null) continue;
		if (part instanceof Error) msg += part.message;
		else if (typeof part === "object") {
			try {
				msg += JSON.stringify(part);
			} catch {
				msg += String(part);
			}
		} else msg += String(part);
	}
	return msg;
}

const matchesId = (t: Toast, id: string) => t.id === id || t.aliases.includes(id);

export function findToast(state: ToastState, id: string): Toast | undefined {
	return state.toasts.find((t) => matchesId(t, id));
}

function createToast(init: ToastInit): Toast {
	const duration = init.duration ?? DEFAULT_DURATIONS[init.type];
	return {
		id: init.id,
		aliases: [],
		type: init.type,
		title: init.title,
		message: init.message,
		count: 1,
		duration,
		remaining: duration,
		timerKey: 0,
		action: init.action,
		progress: init.progress,
		closing: false,
		exitRemaining: EXIT_DURATION,
	};
}

const canDedupe = (init: ToastInit) => init.dedupe !== false && init.type !== "progress" && !init.action && !init.progress;

function push(state: ToastState, init: ToastInit): ToastState {
	if (findToast(state, init.id)) return update(state, init.id, { ...init, action: init.action ?? null, progress: init.progress ?? null, restartTimer: true });

	if (canDedupe(init)) {
		const idx = state.toasts.findIndex(
			(t) => !t.closing && t.type === init.type && t.message === init.message && t.title === init.title && !t.action && !t.progress,
		);
		if (idx !== -1) {
			const existing = state.toasts[idx];
			const duration = init.duration ?? existing.duration;
			const merged: Toast = {
				...existing,
				aliases: [...existing.aliases, init.id],
				count: existing.count + 1,
				duration,
				remaining: duration,
				timerKey: existing.timerKey + 1,
			};
			// Move it to the newest position so a merged toast hidden in the overflow becomes visible again.
			const toasts = state.toasts.filter((_, i) => i !== idx);
			toasts.push(merged);
			return { toasts };
		}
	}
	return { toasts: [...state.toasts, createToast(init)] };
}

function update(state: ToastState, id: string, patch: ToastPatch): ToastState {
	let changed = false;
	const toasts = state.toasts.map((t) => {
		if (!matchesId(t, id)) return t;
		changed = true;
		const type = patch.type ?? t.type;
		const message = patch.message ?? t.message;
		const typeChanged = type !== t.type;
		// A type change re-derives the lifetime (progress ⇒ success starts its 5 s countdown).
		const duration = patch.duration ?? (typeChanged ? DEFAULT_DURATIONS[type] : t.duration);
		const restart = patch.restartTimer ?? (typeChanged || message !== t.message || patch.duration !== undefined);
		let progress = t.progress;
		if (patch.progress === null) progress = undefined;
		else if (patch.progress) progress = { ...t.progress, ...patch.progress };
		if (type !== "progress" && patch.progress === undefined) progress = undefined;
		const next: Toast = {
			...t,
			type,
			message,
			title: "title" in patch ? patch.title : t.title,
			duration,
			action: patch.action === null ? undefined : (patch.action ?? (typeChanged ? undefined : t.action)),
			progress,
			// Updating a toast that is fading out brings it back.
			closing: false,
			exitRemaining: EXIT_DURATION,
		};
		if (restart) {
			next.remaining = duration;
			next.timerKey = t.timerKey + 1;
		} else if (duration !== t.duration) {
			next.remaining = Math.min(t.remaining, duration);
		}
		return next;
	});
	return changed ? { toasts } : state;
}

function dismiss(state: ToastState, id?: string): ToastState {
	let changed = false;
	const toasts = state.toasts.map((t) => {
		if (t.closing || (id !== undefined && !matchesId(t, id))) return t;
		changed = true;
		return { ...t, closing: true, exitRemaining: EXIT_DURATION };
	});
	return changed ? { toasts } : state;
}

export function reduceToasts(state: ToastState, cmd: ToastCommand): ToastState {
	switch (cmd.kind) {
		case "push":
			return push(state, cmd.toast);
		case "update":
			if (!findToast(state, cmd.id)) return cmd.fallback ? push(state, cmd.fallback) : state;
			return update(state, cmd.id, cmd.patch);
		case "dismiss":
			return dismiss(state, cmd.id);
		case "remove": {
			const toasts = state.toasts.filter((t) => !matchesId(t, cmd.id));
			return toasts.length === state.toasts.length ? state : { toasts };
		}
	}
}

/**
 * Ids of the toasts that are shown: the newest `max` open toasts plus every closing one (they are
 * still animating out). Older open toasts wait in the overflow with their timers frozen.
 */
export function visibleToastIds(state: ToastState, max = MAX_VISIBLE): Set<string> {
	const ids = new Set<string>();
	let open = 0;
	for (let i = state.toasts.length - 1; i >= 0; i--) {
		const t = state.toasts[i];
		if (t.closing) ids.add(t.id);
		else if (open < max) {
			ids.add(t.id);
			open++;
		}
	}
	return ids;
}

/**
 * Advances the clocks by `elapsed` ms: visible, finite toasts count down unless `paused` (hover/focus
 * on the stack, hidden tab); expired ones start closing; closing ones are removed once their exit
 * animation is over. Returns the same object when nothing changed.
 */
export function tickToasts(state: ToastState, elapsed: number, opts: { paused?: boolean; maxVisible?: number; exitDuration?: number } = {}): ToastState {
	if (elapsed <= 0 || state.toasts.length === 0) return state;
	const visible = visibleToastIds(state, opts.maxVisible ?? MAX_VISIBLE);
	let changed = false;
	const toasts: Toast[] = [];
	for (const t of state.toasts) {
		if (t.closing) {
			changed = true;
			const exitRemaining = Math.min(t.exitRemaining, opts.exitDuration ?? EXIT_DURATION) - elapsed;
			if (exitRemaining > 0) toasts.push({ ...t, exitRemaining });
			continue;
		}
		if (opts.paused || !visible.has(t.id) || !Number.isFinite(t.duration)) {
			toasts.push(t);
			continue;
		}
		changed = true;
		const remaining = Math.max(0, t.remaining - elapsed);
		toasts.push(remaining === 0 ? { ...t, remaining, closing: true, exitRemaining: EXIT_DURATION } : { ...t, remaining });
	}
	return changed ? { toasts } : state;
}
