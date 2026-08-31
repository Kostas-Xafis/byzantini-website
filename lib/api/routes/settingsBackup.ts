import type { APIContext } from "astro";
import { z } from "astro/zod";
import { Buffer } from "node:buffer";
import { Bucket } from "@lib/bucket";
import { sqliteGenerateBackup } from "@lib/routes/schema.server";
import { APIServer, handlerResult } from "./APIServer";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * SettingsBackup — Phase 4 route group (contracts + handlers in one place).
 * Ported from lib/routes/settingsBackup.client|server.ts.
 *
 * Route keys (getDatabase, getFiles, getFile) match the old client file exactly
 * so components (SettingsPage) keep working.
 */

const getFileReq = z.object({ key: z.string().min(1, "Invalid bucket key") });

const toUint8Array = async (content: Awaited<ReturnType<typeof Bucket.get>>) => {
	if (!content) return null;
	if (content instanceof ArrayBuffer) return new Uint8Array(content);
	if ("arrayBuffer" in content && typeof content.arrayBuffer === "function") {
		return new Uint8Array(await content.arrayBuffer());
	}
	return null;
};

const safeDecode = (value: string) => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

const getKeyCandidates = (rawKey: string) => {
	const decoded = safeDecode(rawKey);
	const candidates = new Set<string>([
		rawKey,
		decoded,
		rawKey.normalize("NFC"),
		rawKey.normalize("NFD"),
		decoded.normalize("NFC"),
		decoded.normalize("NFD"),
		rawKey.replace(/\u00A0/g, " "),
		decoded.replace(/\u00A0/g, " "),
	]);
	return [...candidates];
};

export const settingsBackupRoutes = {
	getDatabase: new APIServer(
		{ method: "GET", path: "/settings/backup/database", responseSchema: z.object({ sql: z.string() }) },
		[authenticateMiddleware],
		() =>
			handlerResult(async () => {
				const sql = await sqliteGenerateBackup();
				return { sql };
			}, "Σφάλμα κατά την λήψη αντιγράφου βάσης"),
	),
	getFiles: new APIServer(
		{ method: "GET", path: "/settings/backup/files", responseSchema: z.object({ files: z.array(z.string()) }) },
		[authenticateMiddleware],
		({ request }) =>
			handlerResult(async () => {
				const files = await Bucket.list(request as unknown as APIContext);
				return { files };
			}, "Σφάλμα κατά την λήψη λίστας αρχείων bucket"),
	),
	getFile: new APIServer(
		{ method: "POST", path: "/settings/backup/file", schema: getFileReq, responseSchema: z.object({ key: z.string(), dataBase64: z.string() }) },
		[authenticateMiddleware],
		({ body, request }) =>
			handlerResult(async () => {
				const { key: rawKey } = body;

				const keyCandidates = getKeyCandidates(rawKey);
				let file: Awaited<ReturnType<typeof Bucket.get>> | null = null;
				let key = rawKey;
				for (const candidate of keyCandidates) {
					file = await Bucket.get(request as unknown as APIContext, candidate);
					if (file) {
						key = candidate;
						break;
					}
				}

				const bytes = await toUint8Array(file);
				if (!bytes) {
					throw Error(`Bucket file not found: ${rawKey}`);
				}

				const dataBase64 = Buffer.from(bytes).toString("base64");
				return { key, dataBase64 };
			}, "Σφάλμα κατά την λήψη αρχείου bucket"),
	),
};
