import fs from "fs";
import path from "path";

const MAX_BASE64_SIZE = 25 * 1024 * 1024; // 25MB

export function removeKey(obj: any, keyPath: string): void {
	const keys = keyPath.includes(".") ? keyPath.split(".") : [keyPath];
	if (keys.length === 0) return;

	let current = obj;
	for (let i = 0; i < keys.length - 1; i++) {
		let key = keys[i];

		if (Array.isArray(current[key])) {
			let remainingKeys = keys.slice(i + 1).join(".");
			current[key].forEach((item: any, i: number) => {
				if (item && typeof item === "object") {
					removeKey(item, remainingKeys);
				}
			});
			break;
		} else if (current[key] !== undefined) {
			current = current[key];
		} else {
			throw new Error(`Key path "${keyPath}" does not exist in the object.`);
		}
		i++;
	}
	delete current[keys[keys.length - 1]];
}

/**
 * Converts a URL or local file path to a Base64-encoded string,
 * throwing an error if the encoded size exceeds 25MB.
 * @param input - URL (http/https) or local file path.
 * @returns Promise<string> - Base64 encoded file content.
 */
export async function toBase64(input: string): Promise<string> {
	let buffer: Buffer;

	if (input.startsWith("http://") || input.startsWith("https://")) {
		const res = await fetch(input);
		if (!res.ok) {
			throw new Error(`Failed Base64 conversion due to file fetch error ${input}: ${res.statusText}`);
		}
		const arrayBuffer = await res.arrayBuffer();
		buffer = Buffer.from(arrayBuffer);
	} else {
		const filePath = path.resolve(input);
		buffer = await fs.promises.readFile(filePath);
	}

	const base64 = buffer.toString("base64");

	if (Buffer.byteLength(base64, "utf8") > MAX_BASE64_SIZE) {
		throw new Error(`Base64-encoded file exceeds 25MB limit for attachments.`);
	}

	return base64;
}
