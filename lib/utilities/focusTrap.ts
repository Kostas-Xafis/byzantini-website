/**
 * Framework-agnostic accessible-dialog helpers, shared by the Solid `Dialog`
 * component (src/components/other/Dialog.solid.tsx), the legacy Popup and the
 * Astro `<script>` dialogs (announcement photo viewer, spoudastiria).
 *
 * `trapFocus(panel, opts)` gives an already-visible dialog panel:
 *  - `role="dialog"` + `aria-modal="true"` (unless the caller set a role),
 *  - initial focus on the first meaningful field (or the panel itself),
 *  - Tab / Shift+Tab cycling inside the panel,
 *  - Esc → `onEscape` (only the top-most open dialog reacts),
 *  - optional body scroll lock (ref-counted, so nested dialogs are safe),
 *  - focus returned to the opener when the returned `release()` is called.
 *
 * The pure parts (`nextFocusIndex`, `isTabbable`) are unit-tested in
 * tests/unit/focusTrap.test.ts.
 */

/** Everything that can receive keyboard focus by default. */
export const FOCUSABLE_SELECTOR = [
	"a[href]",
	"area[href]",
	"button:not([disabled])",
	"input:not([disabled]):not([type='hidden'])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"iframe",
	"audio[controls]",
	"video[controls]",
	"[contenteditable]:not([contenteditable='false'])",
	"[tabindex]",
].join(",");

/** Form fields that make a good initial focus target (read-only date pickers excluded). */
const FIELD_SELECTOR = [
	"input:not([disabled]):not([readonly]):not([type='hidden']):not([type='checkbox']):not([type='radio']):not([type='file']):not([type='button']):not([type='submit'])",
	"select:not([disabled])",
	"textarea:not([disabled]):not([readonly])",
].join(",");

/** The minimal element surface `isTabbable` needs — lets the unit tests use plain objects. */
export type TabbableLike = {
	tabIndex: number;
	disabled?: boolean;
	hidden?: boolean | string;
	getClientRects(): { length: number };
	closest(selector: string): unknown;
};

/** True when the element takes part in sequential (Tab) navigation and is rendered. */
export function isTabbable(el: TabbableLike): boolean {
	if (el.tabIndex < 0) return false;
	if (el.disabled) return false;
	if (el.hidden) return false;
	// display:none (itself or an ancestor) → no client rects.
	if (el.getClientRects().length === 0) return false;
	if (el.closest("[inert]")) return false;
	return true;
}

/**
 * Index of the element that should receive focus after Tab (or Shift+Tab when
 * `backwards`), wrapping around. `current === -1` means focus is not inside
 * the list (e.g. on the panel itself or outside it). Returns -1 for an empty list.
 */
export function nextFocusIndex(current: number, count: number, backwards: boolean): number {
	if (count <= 0) return -1;
	if (current < 0 || current >= count) return backwards ? count - 1 : 0;
	return backwards ? (current - 1 + count) % count : (current + 1) % count;
}

/** The tabbable descendants of `root`, in DOM order. */
export function getTabbables(root: Element): HTMLElement[] {
	return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(isTabbable);
}

export function prefersReducedMotion(): boolean {
	return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// ---------------------------------------------------------------------------
// Body scroll lock (ref-counted)
// ---------------------------------------------------------------------------

let scrollLocks = 0;
let savedOverflow = "";

/** Locks `document.body` scrolling; call the returned function to release (idempotent). */
export function lockBodyScroll(): () => void {
	if (typeof document === "undefined") return () => {};
	if (scrollLocks++ === 0) {
		savedOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
	}
	let released = false;
	return () => {
		if (released) return;
		released = true;
		if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
	};
}

// ---------------------------------------------------------------------------
// Focus trap
// ---------------------------------------------------------------------------

/**
 * Where focus goes when the trap starts:
 * - `"auto"` (default): `[data-autofocus]`/`[autofocus]`, else the first editable field, else the panel;
 * - `"first"`: the first tabbable element, else the panel;
 * - `"container"`: the panel itself;
 * - a selector or element inside the panel;
 * - `false`: leave focus where it is.
 */
export type InitialFocus = "auto" | "first" | "container" | string | HTMLElement | false;

export type TrapFocusOptions = {
	/** Called on Escape while this is the top-most trap. Omit to ignore Escape. */
	onEscape?: (e: KeyboardEvent) => void;
	/** Element to focus on release. Defaults to whatever was focused when the trap started. */
	returnFocusTo?: HTMLElement | null;
	initialFocus?: InitialFocus;
	/** Lock body scrolling while the trap is active (default true). */
	lockScroll?: boolean;
	/** Set `role="dialog"`/`aria-modal="true"` when the panel has no role yet (default true). */
	setAria?: boolean;
};

type ActiveTrap = { panel: HTMLElement; onEscape?: (e: KeyboardEvent) => void };
const trapStack: ActiveTrap[] = [];

function onDocumentKeyDown(e: KeyboardEvent) {
	const top = trapStack[trapStack.length - 1];
	if (!top) return;
	if (e.key === "Escape" || e.key === "Esc") {
		// Let inner widgets (e.g. an open listbox) consume Escape first.
		if (e.defaultPrevented || e.isComposing || !top.onEscape) return;
		e.preventDefault();
		e.stopPropagation();
		top.onEscape(e);
		return;
	}
	if (e.key !== "Tab") return;
	const tabbables = getTabbables(top.panel);
	if (!tabbables.length) {
		e.preventDefault();
		top.panel.focus();
		return;
	}
	const active = document.activeElement as HTMLElement | null;
	const inside = !!active && top.panel.contains(active);
	const index = inside ? tabbables.indexOf(active as HTMLElement) : -1;
	const atEdge = e.shiftKey ? index === 0 : index === tabbables.length - 1;
	// Inside the panel but not at either end → the browser's own order is right.
	if (inside && index !== -1 && !atEdge) return;
	e.preventDefault();
	tabbables[nextFocusIndex(index, tabbables.length, e.shiftKey)].focus();
}

function resolveInitialFocus(panel: HTMLElement, initial: InitialFocus): HTMLElement | null {
	if (initial === false) return null;
	if (initial === "container") return panel;
	if (initial instanceof HTMLElement) return initial;
	if (typeof initial === "string" && initial !== "auto" && initial !== "first") {
		return panel.querySelector<HTMLElement>(initial) ?? panel;
	}
	const tabbables = getTabbables(panel);
	if (initial === "first") return tabbables[0] ?? panel;
	const auto = panel.querySelector<HTMLElement>("[data-autofocus], [autofocus]");
	if (auto && isTabbable(auto)) return auto;
	const field = tabbables.find((el) => el.matches(FIELD_SELECTOR));
	return field ?? panel;
}

/**
 * Traps keyboard focus inside `panel` (which must already be rendered/visible).
 * Returns `release()`, which removes the trap, unlocks scrolling and returns
 * focus to the opener. Safe to call more than once.
 */
export function trapFocus(panel: HTMLElement, opts: TrapFocusOptions = {}): () => void {
	const { onEscape, initialFocus = "auto", lockScroll = true, setAria = true } = opts;
	const returnTo = opts.returnFocusTo !== undefined ? opts.returnFocusTo : (document.activeElement as HTMLElement | null);

	if (setAria && !panel.hasAttribute("role")) panel.setAttribute("role", "dialog");
	if (setAria && !panel.hasAttribute("aria-modal")) panel.setAttribute("aria-modal", "true");
	// The panel itself must be focusable (fallback focus target), but not in the Tab order.
	if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");

	const entry: ActiveTrap = { panel, onEscape };
	if (trapStack.length === 0) document.addEventListener("keydown", onDocumentKeyDown);
	trapStack.push(entry);
	const unlock = lockScroll ? lockBodyScroll() : () => {};

	const target = resolveInitialFocus(panel, initialFocus);
	target?.focus({ preventScroll: target === panel });

	let released = false;
	return () => {
		if (released) return;
		released = true;
		const i = trapStack.indexOf(entry);
		if (i !== -1) trapStack.splice(i, 1);
		if (trapStack.length === 0) document.removeEventListener("keydown", onDocumentKeyDown);
		unlock();
		// Only steal focus back if it is still inside the closing dialog (or lost to <body>).
		const active = document.activeElement;
		const focusLost = !active || active === document.body || panel.contains(active) || !panel.isConnected;
		if (focusLost && returnTo && returnTo.isConnected && typeof returnTo.focus === "function") returnTo.focus();
	};
}

/**
 * Backdrop-click helper: closes only when BOTH the press and the release happen
 * on the backdrop itself, so a text selection that ends outside the panel does
 * not close the dialog. Returns a cleanup function.
 */
export function onBackdropClick(backdrop: HTMLElement, handler: (e: MouseEvent) => void): () => void {
	let pressedOnBackdrop = false;
	const down = (e: PointerEvent) => (pressedOnBackdrop = e.target === backdrop);
	const click = (e: MouseEvent) => {
		if (pressedOnBackdrop && e.target === backdrop) handler(e);
		pressedOnBackdrop = false;
	};
	backdrop.addEventListener("pointerdown", down);
	backdrop.addEventListener("click", click);
	return () => {
		backdrop.removeEventListener("pointerdown", down);
		backdrop.removeEventListener("click", click);
	};
}
