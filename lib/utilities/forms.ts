import type { StringTypeToType } from "@_types/helpers";

type DateFormatType = "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy/mm/dd";

/**
 * A form's date as a local-midnight Date. A native date input (`DateInput`) always sends ISO `yyyy-mm-dd`, whatever
 * it displays; text fields send `format`.
 */
export function parseFormDate(raw: string, format: DateFormatType = "dd/mm/yyyy"): Date {
	const iso = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
	let [day, month, year] = raw.split("/");
	if (format === "mm/dd/yyyy") {
		[month, day] = [day, month];
	} else if (format === "yyyy/mm/dd") {
		[year, month] = [month, year];
	}
	return new Date(Number(year), Number(month) - 1, Number(day));
}
type MultiSelectType = "string" | "number" | "boolean";
type AttributeMatchType = "startsWith" | "endsWith" | "includes";
/** A timestamp as ηη/μμ/εεεε (local time — the day the user sees); "" for none. */
export function formatDayMonthYear(value: number | null | undefined): string {
	if (!value) return "";
	const date = new Date(value);
	if (isNaN(date.getTime())) return "";
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** ηη/μμ/εεεε as a local-midnight Date, or null when it is not a real calendar day (31/02, a short year…). */
export function parseDayMonthYear(text: string): Date | null {
	const match = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (!match) return null;
	const [day, month, year] = match.slice(1).map(Number);
	const date = new Date(year, month - 1, day);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/**
 * What a date field shows while it is typed into: digits get their slashes by themselves (`15032015` → `15/03/2015`).
 * A day or month the user closed with a separator, or that can only be one digit, is padded (`5/3/` and `53` both give
 * `05/03/`). While deleting, no slash is added, so Backspace can remove one.
 */
export function typedDate(raw: string, deleting = false): string {
	const parts = raw.split(/\D+/);
	let digits = parts[0];
	if (parts.length > 1) {
		const pad = (part: string, closed: boolean) => (closed && part.length === 1 ? "0" + part : part).slice(0, 2);
		digits = pad(parts[0], true) + pad(parts[1] ?? "", parts.length > 2) + parts.slice(2).join("");
	}
	// No day starts with 4–9 and no month with 2–9: such a digit is the whole day / month (`1532015` → `15/03/2015`).
	if (/^[4-9]/.test(digits)) digits = "0" + digits;
	if (/^\d{2}[2-9]/.test(digits)) digits = digits.slice(0, 2) + "0" + digits.slice(2);
	digits = digits.slice(0, 8);
	let text = digits.slice(0, 2);
	if (digits.length > 2 || (digits.length === 2 && !deleting)) text += "/";
	text += digits.slice(2, 4);
	if (digits.length > 4 || (digits.length === 4 && !deleting)) text += "/";
	return text + digits.slice(4);
}

export class ExtendedFormData<T extends Record<string, any>> extends FormData {
	private form: HTMLFormElement | null = null;

	constructor(formData: HTMLFormElement);
	constructor(formData: FormData | HTMLFormElement) {
		formData instanceof HTMLFormElement ? super(formData) : super();
		if (formData instanceof FormData) {
			formData.forEach((value, key) => {
				this.append(key, value);
			});
		} else this.form = formData;
	}

	get(key: keyof T): FormDataEntryValue | null {
		return super.get(key as string);
	}

	number(key: keyof T): number;
	number(key: keyof T, fallback: number): number;
	number(key: keyof T, fallback?: number): number {
		if (fallback !== undefined) {
			let num = Number(this.get(key as string));
			if (isNaN(num) || num === null || num === 0) num = fallback;
			return num;
		}
		return Number(this.get(key as string));
	}

	string(key: keyof T): string;
	string(key: keyof T, fallback: string): string;
	string(key: keyof T, fallback?: string): string {
		if (fallback !== undefined) {
			let str = this.get(key as string);
			if (str === null || str === "") str = fallback;
			return str as string;
		}
		return this.get(key as string) as string;
	}

	boolean(key: keyof T): boolean;
	boolean(key: keyof T, fallback: boolean): boolean;
	boolean(key: keyof T, fallback?: boolean): boolean {
		if (fallback !== undefined) {
			let bool = this.get(key as string);
			return bool === null ? fallback : bool === "true";
		}
		return this.get(key as string) === "true";
	}

	date(key: keyof T, format: DateFormatType = "dd/mm/yyyy"): Date {
		return parseFormDate(String(this.get(key as string) ?? ""), format);
	}

	multiSelect<K extends MultiSelectType, B extends boolean>(
		key: keyof T,
		type: K,
		{ single = false as any, isSelected = true }: { single?: B; isSelected?: boolean } = {},
	): B extends true ? StringTypeToType<K> : StringTypeToType<K>[] {
		if (!this.form) return [] as any;
		let valArr = [
			...this.form?.querySelectorAll<HTMLButtonElement>(`button[data-specifier='${key as string}'][data-selected='${isSelected ? "true" : "false"}']`),
		].map((el) => {
			if (type === "number") return Number(el.dataset.value);
			if (type === "boolean") return el.dataset.value === "1";
			return el.getAttribute("data-value");
		});
		return (single ? valArr[0] : valArr) as any;
	}

	// TODO Remove unnecassary complexity between choosing input or button
	getByName<K extends MultiSelectType, B extends boolean>(
		key: string,
		type: K,
		{ cmp = "startsWith", single = false as any, isButton = false }: { cmp?: AttributeMatchType; single?: B; isButton?: boolean } = {},
	): B extends true ? StringTypeToType<K> : StringTypeToType<K>[] {
		let inputs;
		if (!this.form || key === "" || !key) return [] as any;
		const equality = cmp === "startsWith" ? "^=" : cmp === "endsWith" ? "$=" : "*=";
		const query = isButton ? `button[data-specifier${equality}'${key}'][data-selected='true']` : `input[name${equality}'${key}']`;
		switch (cmp) {
			case "endsWith":
				inputs = [...this.form.querySelectorAll(query)] as HTMLInputElement[];
				break;
			case "includes":
				inputs = [...this.form.querySelectorAll(query)] as HTMLInputElement[];
				break;
			case "startsWith":
			default:
				inputs = [...this.form.querySelectorAll(query)] as HTMLInputElement[];
		}
		let list;
		if (type === "number") list = inputs.map((el) => Number(isButton ? el.dataset.value : el.value));
		else if (type === "boolean") list = inputs.map((el) => (isButton ? el.dataset.value : el.value) === "1");
		else list = inputs.map((el) => (isButton ? el.dataset.value : el.value));

		list = list.filter(Boolean);
		return (single ? list[0] : list) as any;
	}
}

export const objToFormData = (obj: Record<string, any>): FormData => {
	let fd = new FormData();
	Object.entries(obj).forEach(([key, value]) => {
		if (value instanceof Object && !(value instanceof Blob)) {
			fd.append(key, "object");
			fd.append(key, JSON.stringify(value));
			return;
		}
		if (typeof value === "number") {
			fd.append(key, "number");
		} else if (typeof value === "boolean") {
			fd.append(key, "boolean");
		} else if (value === null) {
			fd.append(key, "null");
		} else if (value === undefined) {
			fd.append(key, "undefined");
		}
		fd.append(key, value);
	});
	return fd;
};
