import { assertOwnProp } from "./utils.server";

type Charset = "a-z" | "A-Z" | "0-9" | "a-Z" | "a-9" | "A-9" | "a-Z-9" | "hex" | "HEX" | "oct" | "decimal" | "binary" | "base64";
const functions = ["string", "hex", "link", "mail", "date", "standardRandomDate", "boolean", "item", "number", "int", "array", "uniqueArray"];
export class Random {

	static string(size = 16, set: Charset = "a-Z-9") {
		const strLookup = {
			"a-z": "abcdefghijklmnopqrstuvwxyz",
			"A-Z": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
			"0-9": "0123456789",
			"a-Z": "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
			"a-9": "abcdefghijklmnopqrstuvwxyz0123456789",
			"A-9": "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
			"a-Z-9": "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
			"hex": "0123456789abcdef",
			"HEX": "0123456789ABCDEF",
			"oct": "01234567",
			"decimal": "0123456789",
			"binary": "01",
			"base64": "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
		}[set];
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

	static mail() {
		return `${Random.string(10)}@${Random.string(5)}.com`;
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

	static number(min: number, max: number) {
		return Math.random() * (max - min + 1) + min;
	}

	static int(min: number, max: number) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	static array<T>(size: number): typeof Random {
		const arr: T[] = Array.from({ length: size });

		// TODO: Refactor to use loop & make the nested "array" function work
		return functions.reduce((prev, f) => {
			assertOwnProp(prev, "arr");
			return {
				...prev,
				get [f]() {
					return (...args: any[]) => {
						if (f === "array") {
							// console.log(prev.arr);
							// // @ts-ignore
							// return arr.map(() => (Random[f]).apply(null, args));
						} else {
							// @ts-ignore
							return arr.map(() => (Random[f]).apply(null, args));
						}
					};
				}
			};
		}, { arr } as Random) as typeof Random;
	}

	static uniqueArray<T>(size: number, cb: () => T, isRandomSize = false) {
		const arr: T[] = [];
		size = isRandomSize ? Random.int(1, size) : size;
		for (let i = 0; i < size; i++) {
			const item = cb();
			if (!arr.includes(item)) {
				arr.push(item);
			}
		}
		return arr;
	}

}
