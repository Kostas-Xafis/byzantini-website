import { apiCall } from "@hooks/apiCall";
import type { APIResponse } from "@routes/index.client";
import { For, Show, createSignal, onMount } from "solid-js";
import { Badge, PanelPage, cardClass, hintClass, secondaryButtonClass } from "./Panel.solid";
import { toast } from "./toast";

/**
 * «Σφάλματα» (sysadmin): unexpected server errors, one row per distinct error with how often it happened
 * (lib/errors/record.server.ts). The emails worker mails a digest of new ones every 15 minutes
 * (services/emailWorker/src/errorDigest.ts); «Διαγραφή» once dealt with — it comes back if it happens again.
 */

type Row = APIResponse["Errors.list"][number];

const dateTime = (ms: number) => new Date(ms).toLocaleString("el-GR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function ErrorsPage() {
	const [rows, setRows] = createSignal<Row[]>([]);
	const [loading, setLoading] = createSignal(true);
	const [busy, setBusy] = createSignal(false);

	const load = async () => {
		setLoading(true);
		try {
			const res = await apiCall("Errors.list");
			if ("data" in res) setRows(res.data);
		} catch (error) {
			toast.error(error, { title: "Αποτυχία φόρτωσης των σφαλμάτων" });
		} finally {
			setLoading(false);
		}
	};
	onMount(() => void load());

	const remove = async (ids: number[]) => {
		if (ids.length > 1 && !window.confirm(`Διαγραφή και των ${ids.length} σφαλμάτων;`)) return;
		setBusy(true);
		try {
			await apiCall("Errors.delete", { RequestObject: ids });
			setRows(rows().filter((row) => !ids.includes(row.id)));
		} catch (error) {
			toast.error(error, { title: "Αποτυχία διαγραφής" });
		} finally {
			setBusy(false);
		}
	};

	return (
		<PanelPage title="Σφάλματα" subtitle="Απρόσμενα σφάλματα του διακομιστή — κάθε διαφορετικό σφάλμα μία φορά, με το πόσες φορές συνέβη.">
			<Show when={!loading() || rows().length > 0} fallback={<p class={hintClass}>Φόρτωση…</p>}>
				<Show
					when={rows().length > 0}
					fallback={
						<div class={`${cardClass} grid place-items-center gap-2 p-10 text-center`}>
							<i class="fa-solid fa-circle-check text-3xl text-green-700 dark:text-green-300" aria-hidden="true"></i>
							<p class={hintClass}>Δεν έχουν καταγραφεί σφάλματα.</p>
						</div>
					}>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<p class={hintClass}>Ειδοποίηση με email στον διαχειριστή συστήματος κάθε 15 λεπτά, όταν υπάρχουν νέα.</p>
						<button type="button" class={secondaryButtonClass} disabled={busy()} onClick={() => remove(rows().map((row) => row.id))}>
							<i class="fa-solid fa-trash" aria-hidden="true"></i>
							Διαγραφή όλων
						</button>
					</div>
					<ol class="grid gap-3">
						<For each={rows()}>
							{(row) => (
								<li class={`${cardClass} grid gap-2 p-4 sm:p-5`}>
									<div class="flex flex-wrap items-center gap-2">
										<span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-danger" aria-hidden="true">
											<i class="fa-solid fa-triangle-exclamation"></i>
										</span>
										<p class="font-bold [overflow-wrap:anywhere]">{row.source}</p>
										<Badge>HTTP {row.status}</Badge>
										<Badge>{row.count === 1 ? "1 φορά" : `${row.count} φορές`}</Badge>
										<Show when={row.notified_at === null || row.notified_at < row.last_seen_at}>
											<Badge>νέο</Badge>
										</Show>
										<button
											type="button"
											class={`${secondaryButtonClass} ml-auto`}
											disabled={busy()}
											onClick={() => remove([row.id])}
											aria-label={`Διαγραφή του σφάλματος ${row.source}`}>
											<i class="fa-solid fa-xmark" aria-hidden="true"></i>
											Διαγραφή
										</button>
									</div>
									<p class="font-mono text-sm break-words [overflow-wrap:anywhere]">
										<span class="font-bold">{row.error_name}:</span> {row.message}
									</p>
									<p class={`${hintClass} [overflow-wrap:anywhere]`}>
										Τελευταία φορά {dateTime(row.last_seen_at)} · πρώτη {dateTime(row.first_seen_at)} · {row.host}
									</p>
								</li>
							)}
						</For>
					</ol>
				</Show>
			</Show>
		</PanelPage>
	);
}
