import Icon from "@components/other/Icon.solid";
import { apiCall } from "@hooks/apiCall";
import type { APIResponse } from "@routes/index.client";
import { For, Show, createSignal, onMount } from "solid-js";
import { Badge, PanelPage, cardClass, hintClass, secondaryButtonClass } from "./Panel.solid";
import { toast } from "./toast";

/**
 * «Δηλώσεις ενδιαφέροντος» (every admin): what families left on the public «Δήλωση Ενδιαφέροντος» form (contact
 * page, linked from the home page's hero), newest first. Each one was also emailed to the secretariat. «Διαγραφή» once dealt with — what is
 * still listed is what nobody has handled yet (the «Αρχική» dashboard counts them). Kept at most 12 months.
 */

type Row = APIResponse["InterestDeclarations.list"][number];

const PAGE_LABELS: Record<string, string> = { home: "Αρχική σελίδα", contact: "Επικοινωνία" };

const dateTime = (ms: number) => new Date(ms).toLocaleString("el-GR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const linkClass = "inline-flex items-center gap-2 font-semibold text-accent-ink underline decoration-1 underline-offset-4 wrap-anywhere";

export default function InterestPage() {
	const [rows, setRows] = createSignal<Row[]>([]);
	const [loading, setLoading] = createSignal(true);
	const [busy, setBusy] = createSignal(false);

	const load = async () => {
		setLoading(true);
		try {
			const res = await apiCall("InterestDeclarations.list");
			if ("data" in res) setRows(res.data);
		} catch (error) {
			toast.error(error, { title: "Αποτυχία φόρτωσης των δηλώσεων" });
		} finally {
			setLoading(false);
		}
	};
	onMount(() => void load());

	const remove = async (row: Row) => {
		if (!window.confirm(`Διαγραφή της δήλωσης του/της ${row.first_name} ${row.last_name};`)) return;
		setBusy(true);
		try {
			await apiCall("InterestDeclarations.delete", { RequestObject: [row.id] });
			setRows(rows().filter((r) => r.id !== row.id));
		} catch (error) {
			toast.error(error, { title: "Αποτυχία διαγραφής" });
		} finally {
			setBusy(false);
		}
	};

	return (
		<PanelPage title="Δηλώσεις ενδιαφέροντος">
			<Show when={!loading() || rows().length > 0} fallback={<p class={hintClass}>Φόρτωση…</p>}>
				<Show
					when={rows().length > 0}
					fallback={
						<div class={`${cardClass} grid place-items-center gap-2 p-10 text-center`}>
							<Icon name="check-circle" class="text-3xl text-green-700 dark:text-green-300" />
							<p class={hintClass}>Δεν υπάρχουν δηλώσεις που περιμένουν απάντηση.</p>
						</div>
					}>
					<p class={hintClass}>
						Κάθε δήλωση έρχεται και με email στη Γραμματεία. Διαγράψτε τη μόλις επικοινωνήσετε· οι δηλώσεις διαγράφονται αυτόματα μετά από 12 μήνες.
					</p>
					<ol class="grid gap-3">
						<For each={rows()}>
							{(row) => (
								<li class={`${cardClass} grid gap-3 p-4 sm:p-5`}>
									<div class="flex flex-wrap items-center gap-2">
										<span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink" aria-hidden="true">
											<Icon name="user" />
										</span>
										<p class="font-bold wrap-anywhere">
											{row.first_name} {row.last_name}
										</p>
										<Show when={PAGE_LABELS[row.page]}>
											<Badge>{PAGE_LABELS[row.page]}</Badge>
										</Show>
										<span class={`${hintClass} ml-auto`}>{dateTime(row.created_at)}</span>
									</div>
									<div class="flex flex-wrap gap-x-6 gap-y-2">
										<a class={linkClass} href={`tel:${row.phone.replace(/[^\d+]/g, "")}`}>
											<Icon name="phone" />
											{row.phone}
										</a>
										<a class={linkClass} href={`mailto:${row.email}`}>
											<Icon name="mail" />
											{row.email}
										</a>
									</div>
									<Show when={row.message} fallback={<p class={hintClass}>Χωρίς μήνυμα.</p>}>
										<p class="whitespace-pre-wrap wrap-anywhere rounded-lg bg-surface-muted px-3 py-2">{row.message}</p>
									</Show>
									<div class="flex justify-end">
										<button
											type="button"
											class={secondaryButtonClass}
											disabled={busy()}
											onClick={() => remove(row)}
											aria-label={`Διαγραφή της δήλωσης του/της ${row.first_name} ${row.last_name}`}>
											<Icon name="trash" />
											Διαγραφή
										</button>
									</div>
								</li>
							)}
						</For>
					</ol>
				</Show>
			</Show>
		</PanelPage>
	);
}
