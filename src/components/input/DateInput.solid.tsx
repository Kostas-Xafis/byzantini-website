import { Show } from "solid-js";
import Icon from "@components/other/Icon.solid";
import type { IconName } from "@lib/icons";
import { formatDayMonthYear, parseDayMonthYear, typedDate } from "@utilities/forms";

/**
 * A date field that always reads ηη/μμ/εεεε. It replaced an air-datepicker wrapper whose day → month → year steps
 * confused people and whose delayed value writes sometimes emptied the field.
 *
 * - Typed: digits only, the slashes go in by themselves (`15032015` → `15/03/2015`).
 * - Picked: the calendar button opens the browser's own picker (the native wheel on phones) on a hidden date input,
 *   and the chosen day is written back as ηη/μμ/εεεε. A bare `<input type="date">` is not used for the visible field
 *   on purpose: it shows the BROWSER's format, so an English browser would ask for mm/dd/yyyy.
 * - An impossible date (31/02, a 3-digit year, outside 1900–2099) is refused by the browser before the form is sent.
 *
 * The submitted value is the ηη/μμ/εεεε text, which `ExtendedFormData.date` reads.
 */
type DateInputProps = {
	name: string;
	prefix: string;
	/** A timestamp; 0 / missing = empty. */
	value?: number;
	required?: boolean;
	icon?: IconName;
	disabled?: boolean;
	blurDisabled?: boolean;
	/** Earliest / latest accepted day (timestamps). Default: 1900 to 2099. */
	minmax?: [number, number];
};

const INVALID_MESSAGE = "Μη έγκυρη ημερομηνία — συμπληρώστε ηη/μμ/εεεε, π.χ. 15/03/2015.";

/** `yyyy-mm-dd` of a timestamp in local time (the hidden picker's value). */
const isoDay = (stamp: number) => {
	const d = new Date(stamp);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function DateInput(props: DateInputProps) {
	const { name, value, required, icon, disabled, blurDisabled = true, minmax } = props;
	const [min, max] = minmax ?? [new Date(1900, 0, 1).getTime(), new Date(2099, 11, 31).getTime()];
	let field!: HTMLInputElement;
	let picker!: HTMLInputElement;

	/** Marks the field invalid (blocking the submit with a message) when it holds something that is not a date. */
	const validate = () => {
		const text = field.value.trim();
		const date = parseDayMonthYear(text);
		const ok = text === "" || (date !== null && date.getTime() >= min && date.getTime() <= max);
		field.setCustomValidity(ok ? "" : INVALID_MESSAGE);
		if (ok) field.removeAttribute("aria-invalid");
		else field.setAttribute("aria-invalid", "true");
	};

	/** Writes a date as the user would have typed it, and tells the form (dirty tracking, listeners). */
	const commit = (text: string) => {
		field.value = text;
		validate();
		field.dispatchEvent(new Event("input", { bubbles: true }));
		field.dispatchEvent(new Event("change", { bubbles: true }));
	};

	const openPicker = () => {
		const date = parseDayMonthYear(field.value);
		picker.value = date ? isoDay(date.getTime()) : "";
		try {
			picker.showPicker();
		} catch {
			// No showPicker (older browsers): focusing the date input is the next best thing.
			picker.focus();
			picker.click();
		}
	};

	return (
		<>
			<Show when={icon}>
				<Icon
					name={icon!}
					class="absolute text-lg text-gray-500 dark:text-gray-300 top-1/2 -translate-y-1/2 left-6 z-20 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.2)]"
				/>
			</Show>
			<input
				ref={field}
				class={
					"peer m-2 pl-12 pr-14 py-3 text-xl font-didact tabular-nums w-[calc(100%-1rem)] bg-surface text-red-950 dark:text-red-50 shadow-md shadow-gray-400 dark:shadow-gray-700 rounded-md focus:shadow-gray-500 dark:focus:shadow-gray-700 focus:shadow-lg outline-hidden! z-10" +
					(disabled && blurDisabled ? " blur-[1px]" : "")
				}
				type="text"
				inputmode="numeric"
				autocomplete="off"
				maxlength={10}
				placeholder="ηη/μμ/εεεε"
				name={name}
				value={formatDayMonthYear(value)}
				// Read-only, not disabled: a disabled field would drop out of the submitted form.
				readOnly={disabled}
				aria-required={required ? "true" : undefined}
				onInput={(e) => {
					if (!e.isTrusted) return; // our own commit()
					const formatted = typedDate(field.value, (e as InputEvent).inputType?.startsWith("delete") ?? false);
					if (formatted !== field.value) field.value = formatted;
					field.setCustomValidity("");
					field.removeAttribute("aria-invalid");
				}}
				onfocus={(e: FocusEvent) => required && (e.currentTarget as HTMLElement).removeAttribute("required")}
				onblur={(e: FocusEvent) => {
					validate();
					if (required && (e.currentTarget as HTMLInputElement).value === "") (e.currentTarget as HTMLElement).setAttribute("required", "");
				}}
			/>
			<Show when={!disabled}>
				<button
					type="button"
					tabindex="-1"
					aria-label="Επιλογή από ημερολόγιο"
					title="Επιλογή από ημερολόγιο"
					class="absolute right-5 top-1/2 -translate-y-1/2 z-20 grid size-9 place-items-center rounded-md text-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-red-200"
					onClick={openPicker}>
					<Icon name="calendar" />
				</button>
				{/* The browser's own picker, opened by the button; never focused or submitted itself. */}
				<input
					ref={picker}
					type="date"
					tabindex="-1"
					aria-hidden="true"
					min={isoDay(min)}
					max={isoDay(max)}
					class="pointer-events-none absolute right-5 bottom-2 size-px opacity-0 scheme-light dark:scheme-dark"
					onChange={() => {
						const [year, month, day] = picker.value.split("-").map(Number);
						if (year) commit(formatDayMonthYear(new Date(year, month - 1, day).getTime()));
					}}
				/>
			</Show>
		</>
	);
}
