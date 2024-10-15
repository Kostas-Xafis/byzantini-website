type Charset = "a-z" | "A-Z" | "0-9" | "a-Z" | "a-9" | "A-9" | "a-Z-9" | "ascii" | "hex" | "HEX" | "oct" | "decimal" | "binary" | "base64";
type RandomType = typeof Random;
type RandomArrayType = {
	[key in keyof Omit<RandomType, "array" | "prototype">]: RandomType[key] extends (...args: infer A) => infer R ? (...args: A) => R[] : never;
};
const arrFunctions = ["string", "hex", "link", "mail", "date", "standardRandomDate", "boolean", "item", "number", "int", "uniqueArray"];
export class Random {
	private static charsets: Record<Charset, string> = {
		"a-z": "abcdefghijklmnopqrstuvwxyz",
		"A-Z": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
		"0-9": "0123456789",
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

	static string(size = 16, set: Charset = "a-Z-9") {
		const strLookup = this.charsets[set];
		const luSize = strLookup.length; // lookup string size

		let str = "";
		for (let j = 0; j < size; j++) {
			str += strLookup[Math.floor(Math.random() * luSize)];
		}
		return str;
	};

	static hex(size = 16) {
		return Random.string(size, "hex");
	}

	static link(size = 16) {
		return Random.string(size, "a-Z-9");
	}

	static email() {
		return `${Random.string(10)}@${Random.string(5, "a-Z")}.com`;
	}

	static date(start: Date, end: Date) {
		return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
	}

	static standardRandomDate() {
		return Random.date(new Date(0), new Date());
	}

	static boolean() {
		return Math.random() < 0.5;
	}

	static item<T>(arr: T[]) {
		return arr[Math.floor(Math.random() * arr.length)];
	}

	static float(min: number, max: number, precision?: number) {
		let num = Math.random() * (max - min) + min;
		return precision ? Number(num.toFixed(precision)) : num;
	}

	static int(min: number, max: number) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	private static multiDimArray<T>(dimensionsSize: number[], cb: () => T): any {
		if (dimensionsSize.length === 1) {
			return new Array(dimensionsSize[0]).fill(null).map(cb);
		} else {
			return new Array(dimensionsSize[0]).fill(null).map(() => Random.multiDimArray(dimensionsSize.slice(1), cb));
		}
	}

	static array<T>(dimensionsSize: number | number[]): RandomArrayType {
		dimensionsSize = Array.isArray(dimensionsSize) ? dimensionsSize : [dimensionsSize];
		let objRef = {} as any;
		for (let f of arrFunctions) {
			objRef[f] = (...args: any[]) => {
				// @ts-ignore --- ts is too dumb
				return Random.multiDimArray(dimensionsSize, () => (Random[f]).apply(null, args)) as T[];
			};
		}
		return objRef;
	}

	static uniqueArray<T>(size: number, cb: () => T) {
		const arr: T[] = [];
		for (let i = 0; i < size; i++) {
			const item = cb();
			(!arr.includes(item)) && arr.push(item);
		}
		return arr;
	}
}
