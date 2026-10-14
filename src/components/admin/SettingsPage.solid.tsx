import { useAPIClient } from "@hooks/useAPIClient.solid";
import { API } from "@routes/index.client";
import { asyncQueue } from "@utilities/AsyncQueue";
import { isDashboardDarkMode, toggleDashboardTheme } from "@utilities/theme";
import { Show, createSignal, onMount } from "solid-js";
import FeeCatalogEditor from "./FeeCatalogEditor.solid";
import { toast } from "./toast";
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
	/** Overall backup progress for the inline button label (null when idle). */
	const [downloadPct, setDownloadPct] = createSignal<number | null>(null);
	const [isCancelling, setIsCancelling] = createSignal(false);
	let cancelDownload: (() => void) | null = null;
	const [isDarkMode, setIsDarkMode] = createSignal(false);
	const isDevelopmentMode = import.meta.env.MODE === "development";
	const apiHook = useAPIClient();

	onMount(() => {
		setIsDarkMode(isDashboardDarkMode());
	});

	const base64ToBlob = (base64: string, type = "application/octet-stream") => {
		const binaryString = atob(base64);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return new Blob([bytes], { type });
	};

	const formatMB = (bytes: number) => `${(bytes / (1024 * 1024)).toLocaleString("el-GR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;

	const onDownload = async () => {
		if (isDownloading()) return;
		setIsDownloading(true);
		setDownloadPct(0);
		const controller = new AbortController();
		const { signal } = controller;
		const progress = toast.progress({
			title: "Αντίγραφο ασφαλείας",
			label: "Λήψη βάσης δεδομένων…",
			cancelable: true,
			onCancel: () => {
				setIsCancelling(true);
				controller.abort();
			},
		});
		cancelDownload = progress.cancel;
		// Settle a request early when the user cancels (the request itself still finishes in the background).
		const untilAborted = new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
		untilAborted.catch(() => {});
		const abortable = <T,>(p: Promise<T>) => Promise.race([p, untilAborted]);
		try {
			const dbSnapshotRes = await abortable(apiHook(API.SettingsBackup.getDatabase));
			if (!("data" in dbSnapshotRes) || !dbSnapshotRes.data) {
				throw new Error("Αδυναμία λήψης αντιγράφου βάσης δεδομένων");
			}
			const dbSnapshot = dbSnapshotRes.data.sql;
			setDownloadPct(5);

			progress.update({ label: "Λήψη λίστας αρχείων…" });
			const filesRes = await abortable(apiHook(API.SettingsBackup.getFiles));
			if (!("data" in filesRes) || !filesRes.data) {
				throw new Error("Αδυναμία λήψης λίστας αρχείων bucket");
			}
			const bucketFiles = filesRes.data.files || [];
			const total = bucketFiles.length;
			setDownloadPct(10);

			let downloadedBytes = 0;
			const skippedFiles: string[] = [];
			const bucketJobs = bucketFiles.map((fileName) => {
				return async () => {
					try {
						const fileRes = await apiHook(API.SettingsBackup.getFile, {
							RequestObject: { key: fileName },
						});
						if (!("data" in fileRes) || !fileRes.data) {
							throw new Error("Missing file payload");
						}
						const fileBlob = base64ToBlob(fileRes.data.dataBase64);
						downloadedBytes += fileBlob.size;
						return {
							input: fileBlob,
							name: `bucket/${fileName}`,
							size: fileBlob.size,
						} as ZipEntry;
					} catch (error) {
						if (signal.aborted) return null;
						console.warn("[settings-backup] Skipping bucket file", {
							fileName,
							error,
						});
						skippedFiles.push(fileName);
						return null;
					}
				};
			});

			progress.update({ label: "Λήψη αρχείων", done: 0, total, detail: formatMB(0) });
			const downloadedBucketFiles = await asyncQueue(bucketJobs, {
				maxJobs: 10,
				progressOnThrow: true,
				signal,
				onProgress: ({ done }) => {
					progress.update({ done, total, detail: formatMB(downloadedBytes) });
					setDownloadPct(10 + Math.round((done / Math.max(total, 1)) * 80));
				},
			});
			signal.throwIfAborted();
			const validBucketFiles = downloadedBucketFiles.filter((file) => !!file) as ZipEntry[];

			// From here on the work is local and quick: no more cancelling.
			cancelDownload = null;
			progress.update({ label: "Δημιουργία αρχείου .zip…", done: undefined, total: undefined, detail: formatMB(downloadedBytes), cancelable: false });
			setDownloadPct(95);
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
			setDownloadPct(100);

			progress.success(`Βάση δεδομένων και ${validBucketFiles.length} από ${total} αρχεία · ${formatMB(zipBlob.size)} (${filename}).`, {
				title: "Το αντίγραφο ασφαλείας δημιουργήθηκε",
			});
			if (skippedFiles.length > 0) {
				const shown = skippedFiles.slice(0, 5).join(", ");
				const more = skippedFiles.length > 5 ? ` και ${skippedFiles.length - 5} ακόμη` : "";
				toast.warning(`${shown}${more}. Δείτε την κονσόλα για λεπτομέρειες.`, {
					title: `Παραλείφθηκαν ${skippedFiles.length} ${skippedFiles.length === 1 ? "αρχείο" : "αρχεία"} που δεν ήταν δυνατό να ληφθούν`,
					duration: Infinity,
				});
			}
		} catch (error) {
			if (signal.aborted) {
				progress.info("Η λήψη του αντιγράφου ασφαλείας ακυρώθηκε.", { title: "Ακύρωση" });
			} else {
				console.error(error);
				progress.error(error, { title: "Αποτυχία λήψης αντιγράφου ασφαλείας" });
			}
		} finally {
			cancelDownload = null;
			setIsCancelling(false);
			setIsDownloading(false);
			setDownloadPct(null);
		}
	};

	const onCancelDownload = () => cancelDownload?.();

	const onThemeToggle = () => {
		const nextTheme = toggleDashboardTheme();
		setIsDarkMode(nextTheme === "dark");
	};

	return (
		<div class="w-full h-full min-h-0 overflow-y-auto p-6 sm:p-10 bg-red-50 dark:bg-dark text-red-950 dark:text-red-50">
			<div class="max-w-3xl grid gap-6">
				<h1 class="font-anaktoria text-4xl">Ρυθμίσεις</h1>
				<p class="text-sm sm:text-base dark:text-gray-300">Διαχείριση εμφάνισης και αντιγράφων ασφαλείας του πίνακα διαχείρισης.</p>

				<section class="rounded-xl border border-red-900/20 bg-white dark:bg-dark p-5 shadow-md shadow-gray-300 dark:shadow-gray-700 grid gap-4">
					<div class="grid gap-1">
						<h2 class="font-anaktoria text-2xl">Εμφάνιση</h2>
						<p class="text-sm dark:text-gray-300">Επιλέξτε πώς θα εμφανίζεται ο πίνακας διαχείρισης σε αυτή τη συσκευή.</p>
					</div>
					<div class="grid gap-2">
						<p class="text-sm dark:text-gray-300">Σκοτεινή λειτουργία: {isDarkMode() ? "Ενεργή" : "Ανενεργή"}</p>
						<button
							type="button"
							onClick={onThemeToggle}
							class="w-fit rounded-md px-4 py-2 font-bold bg-red-900 text-red-50 hover:bg-red-950 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
							aria-label="Εναλλαγή σκοτεινής λειτουργίας πίνακα διαχείρισης">
							{isDarkMode() ? "Απενεργοποίηση σκοτεινής λειτουργίας" : "Ενεργοποίηση σκοτεινής λειτουργίας"}
						</button>
						<p class="text-xs text-gray-600 dark:text-gray-300">Η επιλογή αποθηκεύεται στον browser και ισχύει μόνο για αυτή τη συσκευή.</p>
					</div>
				</section>

				<section class="rounded-xl border border-red-900/20 bg-white dark:bg-dark p-5 shadow-md shadow-gray-300 dark:shadow-gray-700 grid gap-4">
					<div class="grid gap-1">
						<h2 class="font-anaktoria text-2xl">Ασφάλεια Δεδομένων</h2>
						<p class="text-sm dark:text-gray-300">Λήψη πλήρους αντιγράφου ασφαλείας βάσης δεδομένων και bucket σε αρχείο .zip.</p>
					</div>
					<div class="flex flex-wrap items-center gap-3">
						<button
							type="button"
							onClick={onDownload}
							disabled={isDownloading()}
							aria-busy={isDownloading()}
							class="relative w-fit overflow-hidden rounded-md px-4 py-2 font-bold bg-red-900 text-red-50 hover:bg-red-950 disabled:cursor-progress transition-colors tabular-nums">
							<Show when={isDownloading()}>
								{/* Inline progress fill behind the label. */}
								<span
									aria-hidden="true"
									class="absolute inset-y-0 left-0 bg-red-950 transition-[width] duration-300 motion-reduce:transition-none"
									style={{ width: `${downloadPct() ?? 0}%` }}
								/>
							</Show>
							<span class="relative">
								{isDownloading() ? (
									<>
										<i class="fa-solid fa-circle-notch fa-spin mr-2" aria-hidden="true"></i>
										{`Λήψη… ${downloadPct() ?? 0}%`}
									</>
								) : (
									"Λήψη Backup (.zip)"
								)}
							</span>
						</button>
						<Show when={isDownloading() && (downloadPct() ?? 0) < 95}>
							<button
								type="button"
								onClick={onCancelDownload}
								disabled={isCancelling()}
								class="w-fit rounded-md px-4 py-2 font-bold border border-red-900 text-red-900 hover:bg-red-100 disabled:cursor-wait dark:border-red-300 dark:text-red-100 dark:hover:bg-red-950 transition-colors">
								{isCancelling() ? "Ακύρωση…" : "Ακύρωση"}
							</button>
						</Show>
					</div>
				</section>

				<FeeCatalogEditor />

				{isDevelopmentMode && (
					<section class="rounded-xl border border-red-900/20 bg-white dark:bg-dark p-5 shadow-md shadow-gray-300 dark:shadow-gray-700 grid gap-4">
						<div class="grid gap-1">
							<h2 class="font-anaktoria text-2xl">Migrations (Development ONLY)</h2>
							<p class="text-sm dark:text-gray-300">
								Οι migrations εκτελούνται μέσω του CLI: <code>bunx wrangler d1 migrations apply DB</code>
							</p>
						</div>
					</section>
				)}
			</div>
		</div>
	);
}
