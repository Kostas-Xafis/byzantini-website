import { Bucket } from "@lib/bucket";
import { deepCopy } from "@utilities/objects";
import { Buffer } from "node:buffer";
import { execTryCatch, getUsedBody } from "../utils.server";
import { sqliteGenerateBackup } from "./schema.server";
import { SettingsBackupRoutes } from "./settingsBackup.client";

const serverRoutes = deepCopy(SettingsBackupRoutes);

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

serverRoutes.getDatabase.func = ({ ctx: _ctx }) => {
    return execTryCatch(async () => {
        const sql = await sqliteGenerateBackup();
        return { sql };
    }, "Σφάλμα κατά την λήψη αντιγράφου βάσης");
};

serverRoutes.getFiles.func = ({ ctx }) => {
    return execTryCatch(async () => {
        const files = await Bucket.list(ctx);
        return { files };
    }, "Σφάλμα κατά την λήψη λίστας αρχείων bucket");
};

serverRoutes.getFile.func = ({ ctx }) => {
    return execTryCatch(async () => {
        const body = getUsedBody(ctx) || await ctx.request.json();
        const { key: rawKey } = body;

        const keyCandidates = getKeyCandidates(rawKey);
        let file: Awaited<ReturnType<typeof Bucket.get>> | null = null;
        let key = rawKey;
        for (const candidate of keyCandidates) {
            file = await Bucket.get(ctx, candidate);
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
    }, "Σφάλμα κατά την λήψη αρχείου bucket");
};

export const SettingsBackupServerRoutes = serverRoutes;
