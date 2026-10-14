/**
 * The admin toast state (`lib/utilities/toastStore.ts`) and the command API that drives it
 * (`src/components/admin/toast.ts`), without a DOM: the API's window events are captured on a stub
 * `window` and replayed through the reducer, exactly what `<AlertStack />` does.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	DEFAULT_DURATIONS,
	EXIT_DURATION,
	MAX_VISIBLE,
	emptyToastState,
	findToast,
	formatToastMessage,
	reduceToasts,
	tickToasts,
	visibleToastIds,
	type ToastCommand,
	type ToastInit,
	type ToastState,
} from "@utilities/toastStore";

const init = (over: Partial<ToastInit> = {}): ToastInit => ({ id: Math.random().toString(16).slice(2), type: "success", message: "ok", ...over });
const run = (state: ToastState, ...cmds: ToastCommand[]) => cmds.reduce(reduceToasts, state);
const push = (state: ToastState, over: Partial<ToastInit> = {}) => reduceToasts(state, { kind: "push", toast: init(over) });

describe("formatToastMessage", () => {
	test("joins parts like the legacy createAlert: Error → message, object → JSON", () => {
		expect(formatToastMessage("Σφάλμα: ", new Error("boom"))).toBe("Σφάλμα: boom");
		expect(formatToastMessage("x", 1, { a: 1 })).toBe('x1{"a":1}');
		expect(formatToastMessage(undefined, null, "y")).toBe("y");
	});
});

describe("reduceToasts", () => {
	test("push applies the per-type default lifetime", () => {
		let s = emptyToastState();
		for (const type of ["success", "info", "warning", "error", "progress"] as const) s = push(s, { type, message: type });
		expect(s.toasts.map((t) => t.duration)).toEqual([5000, 5000, 8000, Infinity, Infinity]);
		expect(DEFAULT_DURATIONS.error).toBe(Infinity);
	});

	test("an identical visible toast is merged: ×N counter, timer restart, moved to the newest slot", () => {
		let s = push(emptyToastState(), { id: "a", message: "Αποθηκεύτηκε" });
		s = push(s, { id: "b", type: "info", message: "άλλο" });
		s = tickToasts(s, 2000);
		expect(findToast(s, "a")!.remaining).toBe(3000);
		s = push(s, { id: "c", message: "Αποθηκεύτηκε" });
		expect(s.toasts).toHaveLength(2);
		const merged = s.toasts.at(-1)!;
		expect(merged.id).toBe("a");
		expect(merged.count).toBe(2);
		expect(merged.remaining).toBe(5000);
		expect(merged.timerKey).toBe(1);
		// the merged id stays addressable (legacy updateAlert on the returned alert)
		expect(findToast(s, "c")).toBe(merged);
	});

	test("no dedupe across types, for closing toasts, progress toasts, or with dedupe: false", () => {
		let s = push(emptyToastState(), { id: "a", message: "m" });
		s = push(s, { type: "error", message: "m" });
		s = push(s, { message: "m", dedupe: false });
		expect(s.toasts).toHaveLength(3);
		s = run(s, { kind: "dismiss", id: "a" });
		s = push(s, { type: "progress", message: "p" });
		s = push(s, { type: "progress", message: "p" });
		expect(s.toasts.filter((t) => t.type === "progress")).toHaveLength(2);
	});

	test("update patches in place; a type change re-derives the lifetime and drops the progress block", () => {
		let s = push(emptyToastState(), { id: "p", type: "progress", message: "Λήψη", progress: { done: 1, total: 4 } });
		s = run(s, { kind: "update", id: "p", patch: { progress: { done: 2 }, restartTimer: false } });
		expect(findToast(s, "p")!.progress).toEqual({ done: 2, total: 4 });
		s = run(s, { kind: "update", id: "p", patch: { type: "success", message: "Έτοιμο" } });
		const t = findToast(s, "p")!;
		expect(t.type).toBe("success");
		expect(t.progress).toBeUndefined();
		expect(t.duration).toBe(5000);
		expect(t.remaining).toBe(5000);
	});

	test("update of a missing toast is a no-op unless a fallback is given", () => {
		const s = emptyToastState();
		expect(run(s, { kind: "update", id: "x", patch: { message: "m" } })).toBe(s);
		const withFallback = run(s, { kind: "update", id: "x", patch: { message: "m" }, fallback: init({ id: "x", message: "m" }) });
		expect(withFallback.toasts.map((t) => t.id)).toEqual(["x"]);
	});

	test("dismiss starts the exit animation; tick removes the toast after it", () => {
		let s = push(push(emptyToastState(), { id: "a" }), { id: "b", type: "error", message: "e" });
		s = run(s, { kind: "dismiss", id: "a" });
		expect(findToast(s, "a")!.closing).toBe(true);
		s = tickToasts(s, EXIT_DURATION - 1);
		expect(findToast(s, "a")).toBeDefined();
		s = tickToasts(s, 1);
		expect(findToast(s, "a")).toBeUndefined();
		s = run(s, { kind: "dismiss" });
		expect(s.toasts.every((t) => t.closing)).toBe(true);
	});
});

describe("tickToasts", () => {
	test("success expires, errors persist", () => {
		let s = push(push(emptyToastState(), { id: "ok" }), { id: "err", type: "error", message: "e" });
		s = tickToasts(s, 5000);
		expect(findToast(s, "ok")!.closing).toBe(true);
		expect(findToast(s, "err")!.closing).toBe(false);
	});

	test("paused stack does not count down and returns the same state", () => {
		const s = push(emptyToastState());
		expect(tickToasts(s, 10_000, { paused: true })).toBe(s);
	});

	test("only the newest MAX_VISIBLE open toasts are visible; the overflow is frozen", () => {
		let s = emptyToastState();
		for (let i = 0; i < MAX_VISIBLE + 2; i++) s = push(s, { id: `t${i}`, message: `m${i}` });
		const visible = visibleToastIds(s);
		expect([...visible]).toEqual(["t6", "t5", "t4", "t3", "t2"]);
		s = tickToasts(s, 1000);
		expect(findToast(s, "t0")!.remaining).toBe(5000);
		expect(findToast(s, "t6")!.remaining).toBe(4000);
		// unlimited (expanded stack) counts everyone down
		s = tickToasts(s, 1000, { maxVisible: Infinity });
		expect(findToast(s, "t0")!.remaining).toBe(4000);
	});
});

describe("toast API → reducer", () => {
	const commands: ToastCommand[] = [];
	const g = globalThis as any;
	let hadWindow = false;
	let previousWindow: unknown;

	beforeAll(() => {
		hadWindow = "window" in g;
		previousWindow = g.window;
		const target = new EventTarget();
		target.addEventListener("admin_toast", (e) => commands.push((e as CustomEvent<ToastCommand>).detail));
		g.window = target;
	});
	afterAll(() => {
		if (hadWindow) g.window = previousWindow;
		else delete g.window;
	});

	const replay = () => commands.splice(0).reduce(reduceToasts, emptyToastState());

	test("progress handle: determinate updates, cancel, then resolve into an info toast", async () => {
		const { toast } = await import("@components/admin/toast");
		let cancelled = 0;
		const p = toast.progress({ title: "Αντίγραφο", label: "Λήψη", done: 0, total: 10, cancelable: true, onCancel: () => cancelled++ });
		p.update({ done: 4, total: 10, detail: "1,0 MB" });
		let s = replay();
		let t = findToast(s, p.id)!;
		expect(t.type).toBe("progress");
		expect(t.progress).toEqual({ done: 4, total: 10, detail: "1,0 MB" });
		expect(t.action?.label).toBe("Ακύρωση");

		t.action!.onClick();
		t.action!.onClick();
		expect(cancelled).toBe(1);
		p.update({ done: 5 }); // ignored after cancel
		p.info("Ακυρώθηκε");
		s = commands.splice(0).reduce(reduceToasts, s);
		t = findToast(s, p.id)!;
		expect(t.type).toBe("info");
		expect(t.message).toBe("Ακυρώθηκε");
		expect(t.title).toBe("Αντίγραφο");
		expect(t.action).toBeUndefined();
		expect(t.progress).toBeUndefined();
	});

	test("finishing a progress toast the user already closed pushes a fresh one", async () => {
		const { toast } = await import("@components/admin/toast");
		const p = toast.progress({ title: "x" });
		p.dismiss();
		let s = replay();
		s = tickToasts(s, EXIT_DURATION);
		expect(s.toasts).toHaveLength(0);
		p.error(new Error("boom"));
		s = commands.splice(0).reduce(reduceToasts, s);
		expect(s.toasts.map((t) => [t.type, t.message])).toEqual([["error", "boom"]]);
	});

	test("toast.promise resolves through loading → success and rethrows on failure", async () => {
		const { toast } = await import("@components/admin/toast");
		await expect(toast.promise(Promise.resolve(3), { loading: "…", success: (v) => `got ${v}` })).resolves.toBe(3);
		expect(replay().toasts.map((t) => [t.type, t.message])).toEqual([["success", "got 3"]]);
		await expect(toast.promise(Promise.reject(new Error("nope")), { loading: "…", success: "ok" })).rejects.toThrow("nope");
		expect(replay().toasts.map((t) => [t.type, t.message])).toEqual([["error", "nope"]]);
	});

	test("legacy pushAlert/updateAlert keep working", async () => {
		const { createAlert, pushAlert, updateAlert } = await import("@components/admin/toast");
		const alert = pushAlert(createAlert("success", "Ανέβασμα: 0 / ", 3));
		alert.message = "Ανέβασμα: 1 / 3";
		updateAlert(alert);
		const s = replay();
		expect(findToast(s, alert.id)!.message).toBe("Ανέβασμα: 1 / 3");
		await new Promise<void>((resolve) => {
			alert.onDidUpdate = resolve;
			updateAlert(alert);
		});
	});
});
