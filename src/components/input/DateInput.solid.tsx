import AirDatepicker from "air-datepicker";
import { onMount } from "solid-js";
import { setFocusFixed, sleep } from "../../../lib/utils.client";

const days = ["Κυ", "Δε", "Τρ", "Τε", "Πε", "Πα", "Σα"];

const months = [
	"Ιαν",
	"Φεβ",
	"Μαρ",
	"Απρ",
	"Μαι",
	"Ιουν",
	"Ιουλ",
	"Αυγ",
	"Σεπ",
	"Οκτ",
	"Νοε",
	"Δεκ",
];

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
	iconClasses?: string;
	disabled?: boolean;
	blurDisabled?: boolean;
	minmax?: [number, number];
};

export default function DateInput(props: DateInputProps) {
	const { name, value, required, iconClasses, disabled, blurDisabled = true } = props;
	console.log({ name, value, required, iconClasses, disabled, blurDisabled });
	// if date input has value, set it
	onMount(() => {
		const hasValue = value !== undefined && value !== null;
		const dateInput = document.querySelector(
			`form[data-prefix='${props.prefix}'] input[name='${name}']`
		) as HTMLInputElement;
		// initialize datepicker
		if (!disabled) {
			let finalDate = new Date(hasValue ? (value as number) : Date.now());
			new AirDatepicker(dateInput, {
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
							{ silent: true }
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
							{ silent: true }
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
							{ silent: true }
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
				dateInput.value = date ? formatDateToMarineTime(date) : "dd/mm/yyyy";
			});
		}
		setAfterDatePicker(hasValue ? new Date(value as number) : undefined);
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
			<i
				class={
					"absolute w-min text-lg text-gray-500 top-[calc(50%_-_14px)] left-[1.5rem] z-20 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.2)] " +
					(iconClasses || "")
				}></i>
			<input
				class={
					"peer m-2 px-12 max-sm:pr-2 py-3 text-xl font-didact w-[calc(100%_-_1rem)] bg-white shadow-md shadow-gray-400 rounded-md focus:shadow-gray-500 focus:shadow-lg !outline-none z-10" +
					(disabled && blurDisabled ? " blur-[1px]" : "")
				}
				type="text"
				readOnly={true}
				value={(value && formatDateToMarineTime(value as number)) || "dd/mm/yyyy"}
				name={name}
				onfocus={(e: FocusEvent) =>
					required && (e.currentTarget as HTMLElement).removeAttribute("required")
				}
				onblur={(e: FocusEvent) =>
					required &&
					(e.currentTarget as HTMLInputElement).value === "" &&
					(e.currentTarget as HTMLElement).setAttribute("required", "")
				}
			/>
		</>
	);
}
