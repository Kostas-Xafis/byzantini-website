import AirDatepicker from "air-datepicker";
import { Show, onCleanup, onMount } from "solid-js";
import Icon from "@components/other/Icon.solid";
import type { IconName } from "@lib/icons";
import { setFocusFixed } from "@utilities/dom";
import { sleep } from "@utilities/sleep";

const days = ["Κυ", "Δε", "Τρ", "Τε", "Πε", "Πα", "Σα"];

const months = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαι", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"];

const monthsFull = [
	"Ιανουάριος",
	"Φεβρουάριος",
	"Μάρτιος",
	"Απρίλιος",
	"Μάιος",
	"Ιούνιος",
	"Ιούλιος",
	"Αύγουστος",
	"Σεπτέμβριος",
	"Οκτώβριος",
	"Νοέμβριος",
	"Δεκέμβριος",
];

type DateInputProps = {
	name: string;
	prefix: string;
	value?: number;
	required?: boolean;
	icon?: IconName;
	disabled?: boolean;
	blurDisabled?: boolean;
	minmax?: [number, number];
};

export default function DateInput(props: DateInputProps) {
	const { name, value, required, icon, disabled, blurDisabled = true } = props;
	let datepicker: AirDatepicker<HTMLInputElement> | undefined;
	let disposed = false;
	// The component's own input (a ref, not a document lookup): the router renders a page before inserting it
	// into the document, so `document.querySelector` from onMount found nothing on a navigation — the picker
	// was built on `null`, and destroying that broken instance threw during the next navigation and hung it.
	let dateInput!: HTMLInputElement;
	onCleanup(() => {
		disposed = true;
		try {
			datepicker?.destroy();
		} catch (error) {
			// A teardown failure must never block a route change.
			console.warn("DateInput: datepicker teardown failed", error);
		}
		datepicker = undefined;
	});
	// if date input has value, set it
	onMount(() => {
		const hasValue = value !== undefined && value !== null;
		// initialize datepicker
		if (!disabled) {
			let finalDate = new Date(hasValue ? (value as number) : Date.now());
			datepicker = new AirDatepicker(dateInput, {
				view: "days",
				firstDay: 0,
				dateFormat: "dd-mm-yyyy",
				autoClose: false,
				isMobile: document.body.clientWidth < 768,
				selectedDates: hasValue ? [value] : false,
				onSelect({ date, datepicker }) {
					if (!date || Array.isArray(date)) return;
					if (datepicker.currentView == "days") {
						finalDate.setDate(date.getDate());
						datepicker.update(
							{
								dateFormat: "dd-mm-yyyy",
								minView: "months",
								view: "months",
								selectedDates: [finalDate.getTime()],
							},
							{ silent: true },
						);
						setAfterDatePicker(finalDate, 1);
					} else if (datepicker.currentView == "months") {
						finalDate.setMonth(date.getMonth());
						datepicker.update(
							{
								dateFormat: "dd-mm-yyyy",
								minView: "years",
								view: "years",
								selectedDates: [finalDate.getTime()],
							},
							{ silent: true },
						);
						setAfterDatePicker(finalDate, 1);
					} else {
						finalDate.setFullYear(date.getFullYear());
						datepicker.update(
							{
								dateFormat: "dd-mm-yyyy",
								minView: "days",
								view: "days",
								selectedDates: [finalDate.getTime()],
							},
							{ silent: true },
						);
						setAfterDatePicker(finalDate, 1);
						datepicker.hide();
						setFocusFixed(dateInput.parentElement?.nextElementSibling as HTMLElement);
					}
				},
				locale: {
					days: days,
					daysShort: days,
					daysMin: days,
					months: monthsFull,
					monthsShort: months,
				},
			});
		}
		function setAfterDatePicker(date?: Date, time = 200) {
			// set value after datepicker is initialized because it resets the starting value
			sleep(time).then(() => {
				if (disposed) return;
				dateInput.value = date ? formatDateToMarineTime(date) : "";
			});
		}
		setAfterDatePicker(hasValue ? new Date(value as number) : undefined, 1000);
	});
	const formatDateToMarineTime = (date: Date | number) => {
		let d;
		if (typeof date === "number") d = new Date(date);
		else d = date;

		const year = d.getFullYear();
		const month = d.getMonth() + 1;
		const day = d.getDate();
		return `${day < 10 ? "0" + day : day}/${month < 10 ? "0" + month : month}/${year}`;
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
				ref={dateInput}
				class={
					"peer m-2 px-12 max-sm:pr-2 py-3 text-xl font-didact w-[calc(100%-1rem)] bg-surface text-red-950 dark:text-red-50 shadow-md shadow-gray-400 dark:shadow-gray-700 rounded-md focus:shadow-gray-500 dark:focus:shadow-gray-700 focus:shadow-lg outline-hidden! z-10" +
					(disabled && blurDisabled ? " blur-[1px]" : "")
				}
				type="text"
				readOnly={true}
				value={(value && formatDateToMarineTime(value as number)) || ""}
				placeholder="dd/mm/yyyy"
				name={name}
				aria-required={required ? "true" : undefined}
				onfocus={(e: FocusEvent) => required && (e.currentTarget as HTMLElement).removeAttribute("required")}
				onblur={(e: FocusEvent) =>
					required && (e.currentTarget as HTMLInputElement).value === "" && (e.currentTarget as HTMLElement).setAttribute("required", "")
				}
			/>
		</>
	);
}
