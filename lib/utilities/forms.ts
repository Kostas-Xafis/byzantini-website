import type { StringTypeToType } from "@_types/helpers";

type DateFormatType = "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy/mm/dd";
type MultiSelectType = "string" | "number" | "boolean";
type AttributeMatchType = "startsWith" | "endsWith" | "includes";
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
            if (isNaN(num) || num === null || num === 0)
                num = fallback;
            return num;
        }
        return Number(this.get(key as string));
    }

    string(key: keyof T): string;
    string(key: keyof T, fallback: string): string;
    string(key: keyof T, fallback?: string): string {
        if (fallback !== undefined) {
            let str = this.get(key as string);
            if (str === null || str === "")
                str = fallback;
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
        let [day, month, year] = (this.get(key as string) as string).split("/");
        if (format === "mm/dd/yyyy") {
            [month, day] = [day, month];
        } else if (format === "yyyy/mm/dd") {
            [year, month] = [month, year];
        }
        return new Date(Number(year), Number(month) - 1, Number(day));
    }

    multiSelect<K extends MultiSelectType, B extends boolean>(key: keyof T, type: K, { single = false as any, isSelected = true }: { single?: B; isSelected?: boolean; } = {}): B extends true ? StringTypeToType<K> : StringTypeToType<K>[] {
        if (!this.form) return [] as any;
        let valArr = [...this.form?.querySelectorAll<HTMLButtonElement>(`button[data-specifier='${key as string}'][data-selected='${isSelected ? "true" : "false"}']`)].map((el) => {
            if (type === "number") return Number(el.dataset.value);
            if (type === "boolean") return el.dataset.value === "1";
            return el.getAttribute("data-value");
        });
        return (single ? valArr[0] : valArr) as any;
    };

    // TODO Remove unnecassary complexity between choosing input or button
    getByName<K extends MultiSelectType, B extends boolean>(key: string, type: K, { cmp = "startsWith", single = false as any, isButton = false }: { cmp?: AttributeMatchType, single?: B; isButton?: boolean; } = {}): B extends true ? StringTypeToType<K> : StringTypeToType<K>[] {
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
        if (type === "number") list = inputs.map((el) => Number((isButton ? el.dataset.value : el.value)));
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
