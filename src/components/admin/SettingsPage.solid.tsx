import { useAPIClient } from "@hooks/useAPIClient.solid";
import { API } from "@routes/index.client";
import { asyncQueue } from "@utilities/AsyncQueue";
import { getDashboardThemePreference, setDashboardThemePreference, type DashboardThemePreference } from "@utilities/theme";
import { For, Show, createSignal } from "solid-js";
import FeeCatalogEditor from "./FeeCatalogEditor.solid";
import { PanelCard, PanelCollapsible, PanelPage, hintClass, primaryButtonClass, secondaryButtonClass } from "./Panel.solid";
import { toast } from "./toast";
//@ts-ignore
import * as zip from "https://cdn.jsdelivr.net/npm/client-zip/index.js";

/** When this device last downloaded a backup (shown under the button; per device, like the theme). */
const LAST_BACKUP_KEY = "admin-last-backup";
const readLastBackup = () => {
	try {
		const value = Number(localStorage.getItem(LAST_BACKUP_KEY));
		return Number.isFinite(value) && value > 0 ? value : null;
	} catch {
		return null;
	}
};

const THEME_OPTIONS: { value: DashboardThemePreference; label: string; icon: string }[] = [
	{ value: "light", label: "Φωτεινό", icon: "fa-solid fa-sun" },
	{ value: "dark", label: "Σκοτεινό", icon: "fa-solid fa-moon" },
	{ value: "system", label: "Συσκευής", icon: "fa-solid fa-circle-half-stroke" },
];

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
	// The admin island renders in the browser only (client:only), so the device settings are read up front:
	// no flash of the wrong theme option.
	const [themePreference, setThemePreference] = createSignal<DashboardThemePreference>(getDashboardThemePreference());
	const [lastBackup, setLastBackup] = createSignal<number | null>(readLastBackup());
	const isDevelopmentMode = import.meta.env.MODE === "development";
	const apiHook = useAPIClient();

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
			const now = Date.now();
			setLastBackup(now);
			try {
				localStorage.setItem(LAST_BACKUP_KEY, String(now));
			} catch {}

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

	const onThemeChange = (preference: DashboardThemePreference) => {
		setDashboardThemePreference(preference);
		setThemePreference(preference);
	};

	return (
		<PanelPage title="Ρυθμίσεις" subtitle="Εμφάνιση του πίνακα διαχείρισης, αντίγραφα ασφαλείας και κατάλογος διδάκτρων.">
			<PanelCard icon="fa-solid fa-palette" title="Εμφάνιση" description="Ισχύει μόνο για αυτή τη συσκευή.">
				<div
					role="radiogroup"
					aria-label="Θέμα πίνακα διαχείρισης"
					class="grid grid-cols-3 gap-1 rounded-xl border border-red-900/10 bg-red-50 p-1 dark:border-white/10 dark:bg-black/30 sm:max-w-md"
					onKeyDown={(e) => {
						if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
						e.preventDefault();
						const index = THEME_OPTIONS.findIndex((o) => o.value === themePreference());
						const next = THEME_OPTIONS[(index + (e.key === "ArrowRight" ? 1 : THEME_OPTIONS.length - 1)) % THEME_OPTIONS.length];
						onThemeChange(next.value);
						(e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLButtonElement | null)?.focus();
					}}>
					<For each={THEME_OPTIONS}>
						{(option) => (
							<button
								type="button"
								role="radio"
								data-value={option.value}
								aria-checked={themePreference() === option.value}
								tabIndex={themePreference() === option.value ? 0 : -1}
								onClick={() => onThemeChange(option.value)}
								class={
									"flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-red-900 " +
									(themePreference() === option.value
										? "bg-red-900 text-red-50 shadow-sm shadow-red-950/30"
										: "text-gray-700 hover:bg-red-100 hover:text-red-900 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-red-100")
								}>
								<i class={option.icon} aria-hidden="true"></i>
								{option.label}
							</button>
						)}
					</For>
				</div>
			</PanelCard>

			<PanelCard
				icon="fa-solid fa-cloud-arrow-down"
				title="Αντίγραφο ασφαλείας"
				description="Ένα αρχείο .zip με όλη τη βάση δεδομένων και όλα τα αρχεία (εικόνες, έγγραφα). Φυλάξτε το εκτός υπολογιστή.">
				<div class="grid gap-3">
					<div class="flex flex-wrap items-center gap-3">
						<button
							type="button"
							onClick={onDownload}
							disabled={isDownloading()}
							aria-busy={isDownloading()}
							class={`${primaryButtonClass} px-5 py-2.5`}>
							<i class={isDownloading() ? "fa-solid fa-circle-notch fa-spin" : "fa-solid fa-download"} aria-hidden="true"></i>
							{isDownloading() ? "Λήψη σε εξέλιξη…" : "Λήψη αντιγράφου ασφαλείας"}
						</button>
						<Show when={isDownloading() && (downloadPct() ?? 0) < 95}>
							<button type="button" onClick={onCancelDownload} disabled={isCancelling()} class={secondaryButtonClass}>
								{isCancelling() ? "Ακύρωση…" : "Ακύρωση"}
							</button>
						</Show>
					</div>
					<Show
						when={isDownloading()}
						fallback={
							<p class={hintClass}>
								{lastBackup()
									? `Τελευταία λήψη από αυτή τη συσκευή: ${new Date(lastBackup()!).toLocaleString("el-GR", { dateStyle: "medium", timeStyle: "short" })}`
									: "Δεν έχει γίνει λήψη από αυτή τη συσκευή."}
							</p>
						}>
						<div class="grid gap-1 sm:max-w-md">
							<div
								class="h-2 overflow-hidden rounded-full bg-red-100 dark:bg-black/40"
								role="progressbar"
								aria-label="Πρόοδος λήψης"
								aria-valuemin={0}
								aria-valuemax={100}
								aria-valuenow={downloadPct() ?? 0}>
								<div
									class="h-full rounded-full bg-red-900 dark:bg-red-400 transition-[width] duration-300 motion-reduce:transition-none"
									style={{ width: `${downloadPct() ?? 0}%` }}
								/>
							</div>
							<p class={`${hintClass} tabular-nums`}>
								{downloadPct() ?? 0}% — μπορείτε να συνεχίσετε τη δουλειά σας, η πρόοδος φαίνεται και στην ειδοποίηση.
							</p>
						</div>
					</Show>
				</div>
			</PanelCard>

			<PanelCollapsible
				id="settings-fee-catalog"
				icon="fa-solid fa-euro-sign"
				title="Κατάλογος διδάκτρων"
				description="Οι τιμές διδάκτρων ανά σχολικό έτος. Κάθε αποθήκευση δημιουργεί νέα έκδοση.">
				<FeeCatalogEditor />
			</PanelCollapsible>

			{isDevelopmentMode && (
				<PanelCollapsible id="settings-dev" icon="fa-solid fa-code" title="Για προγραμματιστές" description="Ορατό μόνο σε development.">
					<p class={hintClass}>
						Οι migrations εκτελούνται μέσω του CLI: <code>bunx wrangler d1 migrations apply DB --local</code>
					</p>
				</PanelCollapsible>
			)}
		</PanelPage>
	);
}
