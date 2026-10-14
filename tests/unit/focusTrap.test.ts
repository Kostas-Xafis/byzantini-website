/**
 * Unit tests for the pure parts of lib/utilities/focusTrap.ts (the shared
 * accessible-dialog primitive). No DOM: `isTabbable` takes a duck-typed
 * element and `lockBodyScroll` runs against a stub `document`.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { FOCUSABLE_SELECTOR, isTabbable, lockBodyScroll, nextFocusIndex, type TabbableLike } from "@utilities/focusTrap";

// ---------------------------------------------------------------------------
// nextFocusIndex — Tab / Shift+Tab wrap-around
// ---------------------------------------------------------------------------

test("Tab moves forward and wraps from the last element to the first", () => {
	expect(nextFocusIndex(0, 3, false)).toBe(1);
	expect(nextFocusIndex(1, 3, false)).toBe(2);
	expect(nextFocusIndex(2, 3, false)).toBe(0);
});

test("Shift+Tab moves backwards and wraps from the first element to the last", () => {
	expect(nextFocusIndex(2, 3, true)).toBe(1);
	expect(nextFocusIndex(0, 3, true)).toBe(2);
});

test("focus outside the list enters at the first (Tab) or last (Shift+Tab) element", () => {
	expect(nextFocusIndex(-1, 4, false)).toBe(0);
	expect(nextFocusIndex(-1, 4, true)).toBe(3);
	expect(nextFocusIndex(7, 4, false)).toBe(0);
});

test("a single element keeps the focus; an empty list yields -1", () => {
	expect(nextFocusIndex(0, 1, false)).toBe(0);
	expect(nextFocusIndex(0, 1, true)).toBe(0);
	expect(nextFocusIndex(-1, 0, false)).toBe(-1);
});

// ---------------------------------------------------------------------------
// isTabbable — which matched elements take part in Tab navigation
// ---------------------------------------------------------------------------

const el = (over: Partial<TabbableLike> & { inert?: boolean; rects?: number } = {}): TabbableLike => ({
	tabIndex: 0,
	disabled: false,
	hidden: false,
	getClientRects: () => ({ length: over.rects ?? 1 }),
	closest: (sel: string) => (sel === "[inert]" && over.inert ? {} : null),
	...over,
});

test("a rendered, enabled element with tabIndex >= 0 is tabbable", () => {
	expect(isTabbable(el())).toBe(true);
	expect(isTabbable(el({ tabIndex: 3 }))).toBe(true);
});

test("tabindex=-1, disabled, hidden, display:none and inert elements are skipped", () => {
	expect(isTabbable(el({ tabIndex: -1 }))).toBe(false);
	expect(isTabbable(el({ disabled: true }))).toBe(false);
	expect(isTabbable(el({ hidden: true }))).toBe(false);
	expect(isTabbable(el({ hidden: "until-found" }))).toBe(false);
	expect(isTabbable(el({ rects: 0 }))).toBe(false);
	expect(isTabbable(el({ inert: true }))).toBe(false);
});

test("the focusable selector covers the usual interactive elements but never hidden inputs", () => {
	for (const part of ["a[href]", "button:not([disabled])", "select:not([disabled])", "textarea:not([disabled])", "iframe", "[tabindex]"]) {
		expect(FOCUSABLE_SELECTOR).toContain(part);
	}
	expect(FOCUSABLE_SELECTOR).toContain("input:not([disabled]):not([type='hidden'])");
});

// ---------------------------------------------------------------------------
// lockBodyScroll — ref-counted so nested dialogs don't unlock too early
// ---------------------------------------------------------------------------

const g = globalThis as { document?: unknown };
const realDocument = g.document;
const body = { style: { overflow: "auto" } };
beforeAll(() => {
	g.document = { body };
});
afterAll(() => {
	g.document = realDocument;
});

test("nested scroll locks restore the original overflow only after the last release", () => {
	const releaseOuter = lockBodyScroll();
	expect(body.style.overflow).toBe("hidden");
	const releaseInner = lockBodyScroll();
	releaseInner();
	expect(body.style.overflow).toBe("hidden");
	releaseInner(); // idempotent — must not unlock the outer dialog
	expect(body.style.overflow).toBe("hidden");
	releaseOuter();
	expect(body.style.overflow).toBe("auto");
});
