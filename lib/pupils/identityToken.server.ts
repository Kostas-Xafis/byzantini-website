/**
 * Proof that the public registration form identified a returning pupil (`Pupils.identify`, or the permanent `?regid`
 * link). The identification and the submission are two requests: the first hands the browser this token, the second
 * (`Pupils.post`) sends it back, so the enrollment lands on that pupil without asking for the proof again — which a
 * pupil identified by phone could not give in the ΑΜ + ΑΜΚΑ form.
 *
 * `<payload>.<signature>`: base64url JSON `{ p: pupil id, e: expiry ms }`, HMAC-SHA-256 with a key derived from
 * `SECRET` (rotating it only invalidates forms left open). Valid for an hour, long enough to fill in the form.
 */
import { timingSafeEqual } from "@lib/auth/passwords";

export const IDENTITY_TTL_MS = 60 * 60 * 1000;

const encoder = new TextEncoder();
const base64url = (bytes: Uint8Array) =>
	btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
const fromBase64url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function sign(payload: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", encoder.encode(`pupil_identity:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

export async function sealPupilIdentity(pupilId: number, secret: string, now = Date.now()): Promise<string> {
	if (!secret) throw new Error("SECRET is required to sign the pupil identity");
	const payload = base64url(encoder.encode(JSON.stringify({ p: pupilId, e: now + IDENTITY_TTL_MS })));
	return `${payload}.${await sign(payload, secret)}`;
}

/** The pupil id in `token`, or null when it is malformed, tampered with or expired. */
export async function openPupilIdentity(token: string | null | undefined, secret: string, now = Date.now()): Promise<number | null> {
	if (!token || !secret) return null;
	const [payload, signature, extra] = token.split(".");
	if (!payload || !signature || extra !== undefined) return null;
	if (!timingSafeEqual(await sign(payload, secret), signature)) return null;
	try {
		const { p, e } = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
		if (!Number.isInteger(p) || p < 1 || typeof e !== "number" || e < now) return null;
		return p;
	} catch {
		return null;
	}
}
