import type { EndpointRoute } from "@_types/routes";
import { object, string } from "valibot";

const getDatabase: EndpointRoute<"/settings/backup/database", null, { sql: string; }> = {
    authentication: true,
    method: "GET",
    path: "/settings/backup/database",
    hasUrlParams: false,
    validation: undefined,
};

const getFiles: EndpointRoute<"/settings/backup/files", null, { files: string[]; }> = {
    authentication: true,
    method: "GET",
    path: "/settings/backup/files",
    hasUrlParams: false,
    validation: undefined,
};

const getFileReq = object({ key: string("Invalid bucket key") });
const getFile: EndpointRoute<"/settings/backup/file", typeof getFileReq, { key: string; dataBase64: string; }> = {
    authentication: true,
    method: "POST",
    path: "/settings/backup/file",
    hasUrlParams: false,
    validation: () => getFileReq,
};

export const SettingsBackupRoutes = {
    getDatabase,
    getFiles,
    getFile,
};
