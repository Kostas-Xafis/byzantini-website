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
	placeholder?: string | number;
	value?: string | number;
	required?: boolean;
	iconClasses?: string;
	disabled?: boolean;
	blurDisabled?: boolean;
	minmax?: [number, number];
};

export default function DateInput(props: DateInputProps) {
	const {
		name,
		value,
		required,
		iconClasses,
		disabled,
		placeholder = 0,
		blurDisabled = true,
	} = props;
	// if date input has value, set it
	onMount(() => {
		const hasValue = value !== undefined && value !== null;
		const dateInput = document.querySelector(
			`form[data-prefix='${props.prefix}'] input[name='${name}']`
		) as HTMLInputElement;
		if (!disabled) {
			new AirDatepicker(dateInput, {
				view: "years",
				firstDay: 0,
				dateFormat: "yyyy-mm-dd",
				autoClose: true,
				isMobile: document.body.clientWidth < 768,
				selectedDates: hasValue ? [value] : [placeholder],
				onSelect({ date, datepicker }) {
					if (!date || Array.isArray(date)) return;
					datepicker.hide();
					dateInput.value = formatDateToMarineTime(
						new Date(
							date.getTime() + 1000 * 60 * 60 * 24 // add 1 day to fix timezone bug
						)
					);
					setFocusFixed(dateInput.parentElement?.nextElementSibling as HTMLElement);
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
		// set value after datepicker is initialized because it resets the starting value
		sleep(200).then(() => {
			dateInput.value = value ? formatDateToMarineTime(value as any) : "mm/dd/yyyy";
		});
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
				value={
					((value || placeholder) &&
						formatDateToMarineTime((value || placeholder) as any)) ||
					"dd/mm/yyyy"
				}
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
