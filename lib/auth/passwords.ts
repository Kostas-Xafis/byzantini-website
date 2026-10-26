import { getEnv } from "@env/env";

/**
 * Admin password hashing (server-only; Web Crypto, so it runs the same in workerd and Bun).
 *
 * Stored format: `pbkdf2$<iterations>$<salt hex>$<hash hex>` (PBKDF2-HMAC-SHA256, 32-byte key).
 * The iteration count is stored with each hash, so raising `PBKDF2_ITERATIONS` later only affects new
 * hashes and old ones are upgraded on the next successful sign-in (`needsRehash`). workerd caps PBKDF2
 * at 100 000 iterations.
 *
 * Legacy format `<sha256 hex>:<salt>` — a single SHA-256 over password + SECRET + salt, written before
 * migration 0008 — still verifies, and always reports `needsRehash`.
 *
 * `''` means "no password set" (an admin created through a sign-in provider): it never verifies.
 */
export const PBKDF2_ITERATIONS = 100_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;

const encoder = new TextEncoder();

const toHex = (bytes: ArrayBuffer | Uint8Array) =>
	Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

const fromHex = (hex: string) => {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return bytes;
};

/** Constant-time comparison of two strings of the same alphabet (hex digests). */
export function timingSafeEqual(a: string, b: string): boolean {
	let diff = a.length ^ b.length;
	for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
	return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
	const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, KEY_BITS);
	return toHex(bits);
}

export async function sha256Hex(input: string): Promise<string> {
	return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(input)));
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	return `pbkdf2$${iterations}$${toHex(salt)}$${await pbkdf2(password, salt, iterations)}`;
}

/** Whether `stored` has a password at all (`''` = provider-only account). */
export const hasPassword = (stored: string | null | undefined): stored is string => !!stored;

export type PasswordCheck = { valid: boolean; needsRehash: boolean };

export async function verifyPassword(password: string, stored: string | null | undefined, secret = getEnv().SECRET ?? ""): Promise<PasswordCheck> {
	if (!hasPassword(stored)) {
		// Same work as a real check, so a missing password is not observable through timing.
		await hashPassword(password);
		return { valid: false, needsRehash: false };
	}
	if (stored.startsWith("pbkdf2$")) {
		const [, iterText, saltHex, hashHex] = stored.split("$");
		const iterations = Number(iterText);
		if (!Number.isInteger(iterations) || iterations <= 0 || !saltHex || !hashHex) return { valid: false, needsRehash: false };
		const valid = timingSafeEqual(await pbkdf2(password, fromHex(saltHex), iterations), hashHex);
		return { valid, needsRehash: valid && iterations < PBKDF2_ITERATIONS };
	}
	// Legacy `<sha256>:<salt>`.
	const [hashHex, salt] = stored.split(":");
	if (!hashHex || salt === undefined) return { valid: false, needsRehash: false };
	const valid = timingSafeEqual(await sha256Hex(password + secret + salt), hashHex);
	return { valid, needsRehash: valid };
}
