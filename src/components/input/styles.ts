/**
 * Shared classes of the generic form fields (`Input`, `DateInput`).
 *
 * A field is an outlined box: the `.peer` control sits inside it borderless, the
 * `FIELD_OUTLINE` div after it draws the border (and reacts to the control's
 * focus / invalid state), and the label notches into the top edge.
 */

/** The control itself: input, select, textarea. */
export const FIELD_CONTROL =
	"peer m-1.5 w-[calc(100%_-_0.75rem)] rounded-lg bg-white py-2.5 pr-3 pl-10 font-didact text-lg text-red-950 placeholder:text-gray-400 !outline-hidden z-10 max-sm:pr-2 dark:bg-dark dark:text-red-50 dark:placeholder:text-gray-500";

/** Leading icon, vertically centred on the control. */
export const FIELD_ICON =
	"pointer-events-none absolute top-[calc(50%_-_12px)] left-[1.15rem] z-20 w-min text-base leading-6 text-red-900/55 transition-colors peer-focus:text-red-900 dark:text-red-200/55 dark:peer-focus:text-red-200";

/** The box border, drawn after the control so it can follow `peer-*` states. */
export const FIELD_OUTLINE =
	"pointer-events-none absolute inset-0 h-full w-full rounded-xl border border-gray-300 transition-[border-color,box-shadow] duration-150 peer-hover:border-gray-400 peer-focus:border-red-800 peer-focus:ring-4 peer-focus:ring-red-800/10 peer-[:not(:focus-within):invalid]:border-red-400 dark:border-neutral-600 dark:peer-hover:border-neutral-500 dark:peer-focus:border-red-400 dark:peer-focus:ring-red-400/15";

/** The label, notched into the top border. */
export const FIELD_LABEL =
	"absolute -top-2.5 left-3 z-10 w-min whitespace-nowrap rounded-md bg-white px-1.5 text-sm leading-5 font-semibold text-gray-600 transition-colors peer-focus:text-red-900 peer-[:not(:focus-within):invalid]:text-red-500 dark:bg-dark dark:text-gray-300 dark:peer-focus:text-red-300";
