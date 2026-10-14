/**
 * Admin toast API. Plain TS (no Solid), so table controls and other non-component modules can use it.
 * Every call is turned into a `ToastCommand` and sent over the `admin_toast` window event; the single
 * `<AlertStack />` (mounted by AdminPage) owns the state and renders it.
 *
 * @example
 * toast.success("Η ανακοίνωση αποθηκεύτηκε");
 * toast.error(error, { title: "Αποτυχία αποθήκευσης" });
 * toast.warning("Λείπουν πεδία", { action: { label: "Προβολή", onClick: () => focusForm() } });
 * await toast.promise(save(), { loading: "Αποθήκευση…", success: "Αποθηκεύτηκε", error: (e) => e });
 * const p = toast.progress({ title: "Ανέβασμα", total: files.length, cancelable: true, onCancel: () => ctrl.abort() });
 * p.update({ done: 3 }); p.success("Ολοκληρώθηκε");
 */
import { Random as R } from "@lib/random";
import {
	formatToastMessage,
	type ToastAction,
	type ToastCommand,
	type ToastInit,
	type ToastPatch,
	type ToastProgress,
	type ToastType,
} from "@utilities/toastStore";

export type { ToastAction, ToastProgress, ToastType } from "@utilities/toastStore";

export const TOAST_EVENT = "admin_toast";

/** Anything a message can be built from: strings, numbers, `Error`s (their `.message`), objects (JSON). */
export type ToastMessage = unknown;

export type ToastOptions = {
	title?: string;
	/** ms; `Infinity` keeps the toast until it is closed. Defaults: success/info 5 s, warning 8 s, error ∞. */
	duration?: number;
	action?: ToastAction;
	/** Reuse an id to replace an existing toast. */
	id?: string;
	/** Merge identical visible toasts into one "×N" toast (default true). */
	dedupe?: boolean;
};

export type ToastHandle = {
	readonly id: string;
	update(patch: { message?: ToastMessage; title?: string; type?: Exclude<ToastType, "progress">; duration?: number }): void;
	dismiss(): void;
};

export type ProgressUpdate = ToastProgress & {
	/** The phase text shown under the title (e.g. "Λήψη αρχείων"). */
	label?: string;
	title?: string;
	/** Drop the cancel action (e.g. once cancellation was requested). */
	cancelable?: boolean;
};

export type ProgressOptions = ProgressUpdate & {
	title?: string;
	/** Adds an «Ακύρωση» action calling `onCancel`. */
	cancelable?: boolean;
	onCancel?: () => void;
	cancelLabel?: string;
};

export type ProgressHandle = {
	readonly id: string;
	update(update: ProgressUpdate): void;
	/** Turn the progress toast into a final toast (pushes a new one if the user had closed it). */
	success(message: ToastMessage, opts?: Omit<ToastOptions, "id">): void;
	error(message: ToastMessage, opts?: Omit<ToastOptions, "id">): void;
	warning(message: ToastMessage, opts?: Omit<ToastOptions, "id">): void;
	info(message: ToastMessage, opts?: Omit<ToastOptions, "id">): void;
	/** Same as clicking «Ακύρωση»: shows «Ακύρωση…», drops the action and calls `onCancel` (once). */
	cancel(): void;
	dismiss(): void;
};

export function dispatchToast(cmd: ToastCommand) {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: cmd }));
}

const newId = () => R.hex(8);

function show(type: Exclude<ToastType, "progress">, message: ToastMessage, opts: ToastOptions = {}): ToastHandle {
	const id = opts.id ?? newId();
	dispatchToast({
		kind: "push",
		toast: { id, type, message: formatToastMessage(message), title: opts.title, duration: opts.duration, action: opts.action, dedupe: opts.dedupe },
	});
	return {
		id,
		update(patch) {
			const { message, ...rest } = patch;
			dispatchToast({ kind: "update", id, patch: { ...rest, ...(message !== undefined ? { message: formatToastMessage(message) } : {}) } });
		},
		dismiss: () => dispatchToast({ kind: "dismiss", id }),
	};
}

function progress(opts: ProgressOptions): ProgressHandle {
	const id = newId();
	let cancelRequested = false;
	const cancel = () => {
		if (cancelRequested) return;
		cancelRequested = true;
		dispatchToast({ kind: "update", id, patch: { message: "Ακύρωση…", action: null } });
		opts.onCancel?.();
	};
	const cancelAction = (): ToastAction | undefined =>
		opts.cancelable ? { label: opts.cancelLabel ?? "Ακύρωση", dismiss: false, onClick: cancel } : undefined;

	const progressOf = (u: ProgressUpdate): ToastProgress => ({ done: u.done, total: u.total, detail: u.detail });
	dispatchToast({
		kind: "push",
		toast: { id, type: "progress", title: opts.title, message: opts.label ?? "", progress: progressOf(opts), action: cancelAction() },
	});

	const finish =
		(type: Exclude<ToastType, "progress">) =>
		(message: ToastMessage, o: Omit<ToastOptions, "id"> = {}) => {
			const msg = formatToastMessage(message);
			const title = "title" in o ? o.title : opts.title;
			dispatchToast({
				kind: "update",
				id,
				patch: { type, message: msg, title, duration: o.duration, action: o.action ?? null, progress: null, restartTimer: true },
				fallback: { id, type, message: msg, title, duration: o.duration, action: o.action },
			});
		};

	return {
		id,
		update(u) {
			if (cancelRequested) return; // keep showing «Ακύρωση…» until the operation settles
			const patch: ToastPatch = { restartTimer: false };
			if (u.label !== undefined) patch.message = u.label;
			if (u.title !== undefined) patch.title = u.title;
			if (u.cancelable === false) patch.action = null;
			// `done`/`total` are replaced together so a phase can switch back to an indeterminate bar.
			if ("done" in u || "total" in u || "detail" in u)
				patch.progress = { ...("done" in u || "total" in u ? { done: u.done, total: u.total } : {}), ...("detail" in u ? { detail: u.detail } : {}) };
			dispatchToast({ kind: "update", id, patch });
		},
		success: finish("success"),
		error: finish("error"),
		warning: finish("warning"),
		info: finish("info"),
		cancel,
		dismiss: () => dispatchToast({ kind: "dismiss", id }),
	};
}

type PromiseMessages<T> = {
	loading: string;
	title?: string;
	success: ToastMessage | ((value: T) => ToastMessage);
	error?: ToastMessage | ((error: unknown) => ToastMessage);
};

/** Shows a loading toast while `promise` runs, then turns it into a success or error toast. Returns the promise's result (rejects as it does). */
async function promise<T>(p: Promise<T> | (() => Promise<T>), msgs: PromiseMessages<T>): Promise<T> {
	const handle = progress({ title: msgs.title, label: msgs.loading });
	try {
		const value = await (typeof p === "function" ? p() : p);
		handle.success(typeof msgs.success === "function" ? (msgs.success as (v: T) => ToastMessage)(value) : msgs.success, { title: msgs.title });
		return value;
	} catch (error) {
		const msg = msgs.error === undefined ? error : typeof msgs.error === "function" ? (msgs.error as (e: unknown) => ToastMessage)(error) : msgs.error;
		handle.error(msg, { title: msgs.title });
		throw error;
	}
}

export const toast = Object.assign((message: ToastMessage, opts?: ToastOptions) => show("info", message, opts), {
	success: (message: ToastMessage, opts?: ToastOptions) => show("success", message, opts),
	info: (message: ToastMessage, opts?: ToastOptions) => show("info", message, opts),
	warning: (message: ToastMessage, opts?: ToastOptions) => show("warning", message, opts),
	error: (message: ToastMessage, opts?: ToastOptions) => show("error", message, opts),
	progress,
	promise,
	/** Close one toast, or all of them without an id. */
	dismiss: (id?: string) => dispatchToast({ kind: "dismiss", id }),
});

/* ------------------------------------------------------------------------------------------------ */
/* Legacy API (≈60 call sites): pushAlert(createAlert(type, ...msg)) / updateAlert(alert)            */
/* ------------------------------------------------------------------------------------------------ */

export type Alert = {
	id: string;
	message: string;
	type: "error" | "success" | "warning" | "info";
	status: "push" | "remove" | "update";
	/** Called once the stack applied an `updateAlert`. */
	onDidUpdate?: Function;
	/** Unused by the new stack (lifetimes come from the type / `duration`); kept for type compatibility. */
	expires?: number;
	title?: string;
	duration?: number;
	action?: ToastAction;
};

export function createAlert(type: Alert["type"], ...message: (Record<any, any> | string | number)[]): Alert {
	return { type, message: formatToastMessage(...message), id: newId(), status: "push" };
}

const alertToInit = (alert: Alert): ToastInit => ({
	id: alert.id,
	type: alert.type,
	message: alert.message,
	title: alert.title,
	duration: alert.duration,
	action: alert.action,
});

/**
 * Pushes an alert to the alert stack
 * @example pushAlert(createAlert("success", "This is a success message"));
 * pushAlert(createAlert("error", "This is an error message"));
 */
export function pushAlert(alert: Alert) {
	alert.status = "push";
	dispatchToast({ kind: "push", toast: alertToInit(alert) });
	return alert;
}

/** Re-renders a pushed alert with its (mutated) `message`/`type` and restarts its timer. */
export function updateAlert(alert: Alert) {
	alert.status = "update";
	dispatchToast({
		kind: "update",
		id: alert.id,
		patch: { type: alert.type, message: alert.message, title: alert.title, restartTimer: true },
	});
	// Microtask: callers historically assigned `onDidUpdate` right after calling updateAlert.
	queueMicrotask(() => alert.onDidUpdate?.());
}
