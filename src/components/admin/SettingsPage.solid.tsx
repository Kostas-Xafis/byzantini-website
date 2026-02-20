import { createSignal } from "solid-js";
import { asyncQueue } from "@utilities/AsyncQueue";
import { API, useAPI } from "@hooks/useAPI.solid";
//@ts-ignore
import * as zip from "https://cdn.jsdelivr.net/npm/client-zip/index.js";

const getCurrentFormattedDate = () => {
	const d = new Date();
	return `${d.getFullYear().toString().slice(-2)}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
};

type ZipEntry = {
	input: Blob;
	name: string;
	size: number;
};

export default function SettingsPage() {
	const [isDownloading, setIsDownloading] = createSignal(false);
	const apiHook = useAPI();

	const base64ToBlob = (base64: string, type = "application/octet-stream") => {
		const binaryString = atob(base64);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return new Blob([bytes], { type });
	};

	const onDownload = async () => {
		if (isDownloading()) return;
		setIsDownloading(true);
		try {
			const dbSnapshotRes = await apiHook(API.SettingsBackup.getDatabase);
			if (!dbSnapshotRes.data) {
				throw new Error("Αδυναμία λήψης αντιγράφου βάσης δεδομένων");
			}
			const dbSnapshot = dbSnapshotRes.data.sql;

			const filesRes = await apiHook(API.SettingsBackup.getFiles);
			if (!filesRes.data) {
				throw new Error("Αδυναμία λήψης λίστας αρχείων bucket");
			}
			const bucketFiles = filesRes.data.files || [];

			const bucketJobs = bucketFiles.map((fileName) => {
				return async () => {
					try {
						const fileRes = await apiHook(API.SettingsBackup.getFile, {
							RequestObject: { key: fileName },
						});
						if (!fileRes.data) {
							throw new Error("Missing file payload");
						}
						const fileBlob = base64ToBlob(fileRes.data.dataBase64);
						return {
							input: fileBlob,
							name: `bucket/${fileName}`,
							size: fileBlob.size,
						} as ZipEntry;
					} catch (error) {
						console.warn("[settings-backup] Skipping bucket file", {
							fileName,
							error,
						});
						return null;
					}
				};
			});

			const downloadedBucketFiles = await asyncQueue(bucketJobs, {
				maxJobs: 10,
				progressOnThrow: true,
			});
			const validBucketFiles = downloadedBucketFiles.filter((file) => !!file) as ZipEntry[];

			const dbBlob = new Blob([dbSnapshot], { type: "text/plain;charset=utf-8" });
			const zipEntries = [
				{
					input: dbBlob,
					name: `database/snap-${getCurrentFormattedDate()}.sql`,
					size: dbBlob.size,
				},
				...validBucketFiles,
			];

			const z = zip as Window["zip"];
			const zipBlob = await z.downloadZip(zipEntries).blob();
			const filename = `full-backup-${getCurrentFormattedDate()}.zip`;

			const downloadURL = URL.createObjectURL(zipBlob);
			const anchor = document.createElement("a");
			anchor.href = downloadURL;
			anchor.download = filename;
			anchor.click();
			anchor.remove();
			URL.revokeObjectURL(downloadURL);
		} catch (error) {
			console.error(error);
			window.alert("Αποτυχία λήψης αντιγράφου ασφαλείας");
		} finally {
			setIsDownloading(false);
		}
	};

	return (
		<div class="w-full min-h-screen p-6 sm:p-10 bg-red-50 text-red-950">
			<div class="max-w-xl grid gap-4">
				<h1 class="font-anaktoria text-4xl">Ρυθμίσεις</h1>
				<p class="text-sm sm:text-base">
					Λήψη πλήρους αντιγράφου ασφαλείας βάσης δεδομένων και bucket.
				</p>
				<button
					type="button"
					onClick={onDownload}
					disabled={isDownloading()}
					class="w-fit rounded-md px-4 py-2 font-bold bg-red-900 text-red-50 hover:bg-red-950 disabled:opacity-70 disabled:cursor-not-allowed transition-colors">
					{isDownloading() ? "Προετοιμασία αντιγράφου..." : "Λήψη Backup (.zip)"}
				</button>
			</div>
		</div>
	);
}
