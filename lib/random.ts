type Charset = "a-z" | "A-Z" | "0-9" | "{1-9}0-9" | "1-9" | "a-Z" | "a-9" | "A-9" | "a-Z-9" | "ascii" | "hex" | "HEX" | "oct" | "decimal" | "binary" | "base64";
type RandomType = typeof Random;
type RandomArrayType<T> = {
	[key in keyof Omit<RandomType, "array" | "prototype">]: RandomType[key] extends (...args: infer A) => any ? (...args: A) => T[] : never;
};

const arrFunctions: (keyof typeof Random)[] = ["string", "hex", "link", "email", "date", "standardRandomDate", "boolean", "item", "float", "int", "uniqueArray"];
export class Random {

	private static throwIfInvalidSize(size: number) {
		if (size < 1) throw new Error("Size must be a positive integer");
	}

	private static charsets: Record<Charset, string> = {
		"a-z": "abcdefghijklmnopqrstuvwxyz",
		"A-Z": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
		"0-9": "0123456789",
		"{1-9}0-9": "0123456789",
		"1-9": "123456789",
		"a-Z": "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
		"a-9": "abcdefghijklmnopqrstuvwxyz0123456789",
		"A-9": "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
		"a-Z-9": "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
		"ascii": "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",
		"hex": "0123456789abcdef",
		"HEX": "0123456789ABCDEF",
		"oct": "01234567",
		"decimal": "0123456789",
		"binary": "01",
		"base64": "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
	};

	static string(size = 16, set: Charset = "a-Z-9"): string {
		Random.throwIfInvalidSize(size);

		const strLookup = Random.charsets[set];
		const luSize = strLookup.length; // lookup string size

		if (set === "{1-9}0-9" && size > 1) {
			return Random.string(1, "1-9") + Random.string(size - 1, "0-9");
		}

		let str = "";
		for (let j = 0; j < size; j++) {
			str += strLookup[Math.floor(Math.random() * luSize)];
		}
		return str;
	};

	static hex(size = 16) {
		Random.throwIfInvalidSize(size);
		return Random.string(size, "hex");
	}

	static link(size = 16) {
		Random.throwIfInvalidSize(size);
		return Random.string(size, "a-Z-9");
	}

	static email() {
		return `${Random.string(10, "a-Z")}@${Random.string(5, "a-Z")}.com`;
	}

	static date(): Date;
	static date(start: Date): Date;
	static date(start: Date, end: Date): Date;
	static date(start?: Date, end?: Date) {
		if (!start) return new Date(Random.int(0, Date.now()));
		if (!end) return new Date(start.getTime() + Math.random() * (Date.now() - start.getTime()));
		return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
	}

	static standardRandomDate() {
		return Random.date();
	}

	static boolean() {
		return Math.random() < 0.5;
	}

	static item<T>(arr: T[]): T {
		return arr[Math.floor(Math.random() * arr.length)];
	}

	static items<T>(arr: T[], size: number = Random.int(1, arr.length)) {
		return Random.array<T>(size).item(arr);
	}

	static uniqueItems<T>(arr: T[], size: number = Random.int(1, arr.length)) {
		return Random.uniqueArray<T>(size, () => Random.item(arr));
	}

	static float(min: number, max: number, precision?: number) {
		let num = Math.random() * (max - min) + min;
		return precision ? Number(num.toFixed(precision)) : num;
	}

	static int(min: number, max: number) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	private static multiDimArray<T>(dimensionsSize: number | number[], cb: () => T): any {
		let dims = Array.isArray(dimensionsSize) ? dimensionsSize : [dimensionsSize];
		return new Array(dims[0]).fill(null).map(dims.length === 1
			? cb
			: () => Random.multiDimArray(dims.slice(1), cb));
	}

	static array<T>(...dimensionsSize: number[]): RandomArrayType<T> {
		for (let size of dimensionsSize)
			Random.throwIfInvalidSize(size);

		let objRef = {} as any;
		for (let f of arrFunctions) {
			objRef[f] = (...args: any[]) => {
				return Random.multiDimArray<T>(dimensionsSize, () => (Random[f] as any).apply(null, args));
			};
		}
		return objRef;
	}

	static uniqueArray<T>(size: number, cb: () => T) {
		const arr: T[] = [];
		for (let i = 0; i < size; i++) {
			const item = cb();
			if (!arr.includes(item)) {
				arr.push(item);
			} else i--;
		}
		return arr;
	}
}
