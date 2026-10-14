/**
 * An expected API failure, thrown by handlers (or anything they call) for an
 * outcome the caller must see: a missing row, a rule the request breaks, a
 * conflict with the current state.
 *
 * `handlerResult` and `APIServer.handle` turn it into the error envelope
 * `{ error: message, details? }` with `status`. The message is PUBLIC: the
 * admin UI and the registration form show it as is, so write it in Greek and
 * never put SQL, binding or stack text in it. Anything else that is thrown is
 * an unexpected failure: it is logged with `console.error` and the caller only
 * gets a generic message with a 500.
 *
 * @example throw APIError.notFound("Το βιβλίο δεν βρέθηκε");
 */
export class APIError extends Error {
	readonly status: number;
	readonly details?: unknown;

	constructor(status: number, message: string, details?: unknown) {
		super(message);
		this.name = "APIError";
		this.status = status;
		this.details = details;
	}

	/** 400 — the request itself is invalid, whatever the stored data. */
	static badRequest(message: string, details?: unknown) {
		return new APIError(400, message, details);
	}

	/** 403 — the caller is known but may not do this. */
	static forbidden(message: string) {
		return new APIError(403, message);
	}

	/** 404 — the row the request names does not exist. */
	static notFound(message: string) {
		return new APIError(404, message);
	}

	/** 409 — the request conflicts with the current state (stock, existing row, a lower limit). */
	static conflict(message: string) {
		return new APIError(409, message);
	}

	/** 410 — a one-time or expiring resource (invite link) that is used up or has expired. */
	static gone(message: string) {
		return new APIError(410, message);
	}
}
