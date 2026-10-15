import { onBackdropClick, trapFocus, type InitialFocus } from "@utilities/focusTrap";
import { Show, onCleanup, onMount, type JSX } from "solid-js";
import Icon from "@components/other/Icon.solid";

export type DialogProps = {
	/** Mounts the dialog (and starts the focus trap) while true. */
	open: boolean;
	/** Called on Escape, on a backdrop click (see `closeOnBackdrop`) and by the caller's own close button. */
	onClose: () => void;
	/** id of the element holding the dialog's title (→ `aria-labelledby`). */
	labelledBy?: string;
	/** Accessible name when there is no visible title element. */
	label?: string;
	describedBy?: string;
	role?: "dialog" | "alertdialog";
	/** Backdrop click closes the dialog. A function is evaluated per click (e.g. "only when the form is pristine"). Default true. */
	closeOnBackdrop?: boolean | (() => boolean);
	/** Escape closes the dialog (default true). Return false from `beforeEscape` to keep it open. */
	closeOnEscape?: boolean;
	beforeEscape?: () => boolean;
	initialFocus?: InitialFocus;
	/** Defaults to the element focused when the dialog opened. */
	returnFocusTo?: HTMLElement | null;
	lockScroll?: boolean;
	/** Classes of the full-screen backdrop (it is the positioning container of the panel). */
	backdropClass?: string;
	/** Classes of the dialog panel. */
	class?: string;
	id?: string;
	ref?: (el: HTMLDivElement) => void;
	children: JSX.Element;
};

/**
 * Accessible modal dialog: role="dialog", aria-modal, accessible name,
 * focus trap, Esc, focus return, scroll lock and (configurable) backdrop
 * click — see lib/utilities/focusTrap.ts. The caller renders its own title
 * (pass its id as `labelledBy`) and close button (use `DialogCloseButton`).
 */
export default function Dialog(props: DialogProps) {
	return (
		<Show when={props.open}>
			<DialogInner {...props} />
		</Show>
	);
}

function DialogInner(props: DialogProps) {
	let backdrop!: HTMLDivElement;
	let panel!: HTMLDivElement;

	onMount(() => {
		const release = trapFocus(panel, {
			initialFocus: props.initialFocus,
			returnFocusTo: props.returnFocusTo,
			lockScroll: props.lockScroll ?? true,
			onEscape:
				props.closeOnEscape === false
					? undefined
					: () => {
							if (props.beforeEscape && !props.beforeEscape()) return;
							props.onClose();
						},
		});
		const offBackdrop = onBackdropClick(backdrop, () => {
			const allowed = typeof props.closeOnBackdrop === "function" ? props.closeOnBackdrop() : (props.closeOnBackdrop ?? true);
			if (allowed) props.onClose();
		});
		onCleanup(() => {
			offBackdrop();
			release();
		});
	});

	return (
		<div ref={backdrop} class={props.backdropClass} role="presentation">
			<div
				ref={(el) => {
					panel = el;
					props.ref?.(el);
				}}
				id={props.id}
				class={props.class}
				role={props.role ?? "dialog"}
				aria-modal="true"
				aria-labelledby={props.labelledBy}
				aria-label={props.labelledBy ? undefined : props.label}
				aria-describedby={props.describedBy}
				tabindex="-1">
				{props.children}
			</div>
		</div>
	);
}

/** Icon close button with the Greek accessible name every dialog shares. */
export function DialogCloseButton(props: { onClick: (e: MouseEvent) => void; class?: string; label?: string }) {
	return (
		<button
			type="button"
			aria-label={props.label ?? "Κλείσιμο"}
			title={props.label ?? "Κλείσιμο"}
			class={
				"flex items-center justify-center aspect-square rounded-xl text-gray-700 dark:text-gray-200 bg-gray-100/80 dark:bg-gray-800/80 hover:bg-gray-300 dark:hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900 closeBtn " +
				(props.class ?? "")
			}
			onClick={(e) => props.onClick(e)}>
			<Icon name="close" />
		</button>
	);
}
