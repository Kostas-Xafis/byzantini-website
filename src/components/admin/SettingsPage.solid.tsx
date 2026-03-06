import { createSignal, onMount } from "solid-js";
import { asyncQueue } from "@utilities/AsyncQueue";
import { API, useAPI } from "@hooks/useAPI.solid";
import { isDashboardDarkMode, toggleDashboardTheme } from "@utilities/theme";
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
	const [isDarkMode, setIsDarkMode] = createSignal(false);
	const [isMigratingTarget, setIsMigratingTarget] = createSignal<"local" | "production" | null>(
		null,
	);
	const [migrationResult, setMigrationResult] = createSignal<string>("");
	const isDevelopmentMode = import.meta.env.MODE === "development";
	const apiHook = useAPI();

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

	const onThemeToggle = () => {
		const nextTheme = toggleDashboardTheme();
		setIsDarkMode(nextTheme === "dark");
	};

	const onMigrate = async (target: "local" | "production") => {
		if (isMigratingTarget()) return;
		setIsMigratingTarget(target);
		setMigrationResult("");
		try {
			const res = await apiHook(API.Schema.migrate, {
				UrlArgs: { target },
			});
			if (res.message) {
				setMigrationResult(res.message);
				return;
			}
			throw new Error((res as any).error || "Αποτυχία migration");
		} catch (error) {
			console.error(error);
			setMigrationResult("Αποτυχία migration");
		} finally {
			setIsMigratingTarget(null);
		}
	};

	return (
		<div class="w-full min-h-screen p-6 sm:p-10 bg-red-50 dark:bg-dark text-red-950 dark:text-red-50">
			<div class="max-w-3xl grid gap-6">
				<h1 class="font-anaktoria text-4xl">Ρυθμίσεις</h1>
				<p class="text-sm sm:text-base dark:text-gray-300">
					Διαχείριση εμφάνισης και αντιγράφων ασφαλείας του πίνακα διαχείρισης.
				</p>

				<section class="rounded-xl border border-red-900/20 bg-white dark:bg-dark p-5 shadow-md shadow-gray-300 dark:shadow-gray-700 grid gap-4">
					<div class="grid gap-1">
						<h2 class="font-anaktoria text-2xl">Εμφάνιση</h2>
						<p class="text-sm dark:text-gray-300">
							Επιλέξτε πώς θα εμφανίζεται ο πίνακας διαχείρισης σε αυτή τη συσκευή.
						</p>
					</div>
					<div class="grid gap-2">
						<p class="text-sm dark:text-gray-300">
							Σκοτεινή λειτουργία: {isDarkMode() ? "Ενεργή" : "Ανενεργή"}
						</p>
						<button
							type="button"
							onClick={onThemeToggle}
							class="w-fit rounded-md px-4 py-2 font-bold bg-red-900 text-red-50 hover:bg-red-950 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
							aria-label="Εναλλαγή σκοτεινής λειτουργίας πίνακα διαχείρισης">
							{isDarkMode()
								? "Απενεργοποίηση σκοτεινής λειτουργίας"
								: "Ενεργοποίηση σκοτεινής λειτουργίας"}
						</button>
						<p class="text-xs text-gray-600 dark:text-gray-300">
							Η επιλογή αποθηκεύεται στον browser και ισχύει μόνο για αυτή τη συσκευή.
						</p>
					</div>
				</section>

				<section class="rounded-xl border border-red-900/20 bg-white dark:bg-dark p-5 shadow-md shadow-gray-300 dark:shadow-gray-700 grid gap-4">
					<div class="grid gap-1">
						<h2 class="font-anaktoria text-2xl">Ασφάλεια Δεδομένων</h2>
						<p class="text-sm dark:text-gray-300">
							Λήψη πλήρους αντιγράφου ασφαλείας βάσης δεδομένων και bucket σε αρχείο
							.zip.
						</p>
					</div>
					<button
						type="button"
						onClick={onDownload}
						disabled={isDownloading()}
						class="w-fit rounded-md px-4 py-2 font-bold bg-red-900 text-red-50 hover:bg-red-950 disabled:opacity-70 disabled:cursor-not-allowed transition-colors">
						{isDownloading() ? "Προετοιμασία αντιγράφου..." : "Λήψη Backup (.zip)"}
					</button>
				</section>

				{isDevelopmentMode && (
					<section class="rounded-xl border border-red-900/20 bg-white dark:bg-dark p-5 shadow-md shadow-gray-300 dark:shadow-gray-700 grid gap-4">
						<div class="grid gap-1">
							<h2 class="font-anaktoria text-2xl">Migrations (Development ONLY)</h2>
							<p class="text-sm dark:text-gray-300">
								Εκτέλεση του {"latest.sql"} migration είτε στη local είτε στην
								production βάση.
							</p>
						</div>
						<div class="flex flex-wrap gap-3">
							<button
								type="button"
								onClick={() => onMigrate("local")}
								disabled={isMigratingTarget() !== null}
								class="w-fit rounded-md px-4 py-2 font-bold bg-red-900 text-red-50 hover:bg-red-950 disabled:opacity-70 disabled:cursor-not-allowed transition-colors">
								{isMigratingTarget() === "local"
									? "Εκτέλεση migration..."
									: "Migration στη Local βάση"}
							</button>
							<button
								type="button"
								onClick={() => onMigrate("production")}
								disabled={isMigratingTarget() !== null}
								class="w-fit rounded-md px-4 py-2 font-bold bg-red-900 text-red-50 hover:bg-red-950 disabled:opacity-70 disabled:cursor-not-allowed transition-colors">
								{isMigratingTarget() === "production"
									? "Εκτέλεση migration..."
									: "Migration στην Production βάση"}
							</button>
						</div>
						{migrationResult() && (
							<p class="text-sm dark:text-gray-300">{migrationResult()}</p>
						)}
					</section>
				)}
			</div>
		</div>
	);
}
