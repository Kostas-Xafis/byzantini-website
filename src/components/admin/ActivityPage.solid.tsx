import { apiCall } from "@hooks/apiCall";
import { ACTIVITY_GROUPS } from "@lib/activity/labels";
import type { APIResponse } from "@routes/index.client";
import { For, Show, createMemo, createSignal, onMount } from "solid-js";
import { PanelPage, cardClass, hintClass, inputClass, secondaryButtonClass } from "./Panel.solid";
import { toast } from "./toast";

/**
 * «Ιστορικό ενεργειών» (sysadmin and owner): who changed what, newest first, grouped by day. Filters by
 * admin and by category; «Περισσότερα» loads older entries (lib/api/routes/activity.ts).
 */

type Row = APIResponse["Activity.list"]["rows"][number];

const CATEGORIES = [...new Set(Object.values(ACTIVITY_GROUPS))];

/** Font Awesome icon per category (the endpoint group of a row). */
const GROUP_ICONS: Record<string, string> = {
	Pupils: "fa-address-book",
	Payments: "fa-hand-holding-dollar",
	Payoffs: "fa-file-invoice-dollar",
	Books: "fa-book",
	Wholesalers: "fa-truck",
	Teachers: "fa-chalkboard-user",
	Instruments: "fa-guitar",
	Locations: "fa-location-dot",
	Announcements: "fa-bullhorn",
	FeeCatalog: "fa-euro-sign",
	SysUsers: "fa-users-gear",
	Authentication: "fa-key",
};

const dayLabel = (ms: number) => {
	const date = new Date(ms);
	const today = new Date();
	const yesterday = new Date(today.getTime() - 86_400_000);
	const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
	if (same(date, today)) return "Σήμερα";
	if (same(date, yesterday)) return "Χθες";
	return date.toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};
const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
const isDeletion = (endpoint: string) => /\.(delete\w*|imagesDelete|fileDelete|unlinkProvider)$/.test(endpoint);

export default function ActivityPage() {
	const [rows, setRows] = createSignal<Row[]>([]);
	const [next, setNext] = createSignal<number | null>(null);
	const [loading, setLoading] = createSignal(true);
	const [admins, setAdmins] = createSignal<string[]>([]);
	const [admin, setAdmin] = createSignal("");
	const [category, setCategory] = createSignal("");

	const load = async (append: boolean) => {
		setLoading(true);
		try {
			const res = await apiCall("Activity.list", {
				RequestObject: {
					...(append && next() ? { before: next()! } : {}),
					...(admin() ? { user_email: admin() } : {}),
					...(category() ? { category: category() } : {}),
				},
			});
			if ("data" in res) {
				setRows(append ? [...rows(), ...res.data.rows] : res.data.rows);
				setNext(res.data.next);
			}
		} catch (error) {
			toast.error(error, { title: "Αποτυχία φόρτωσης του ιστορικού" });
		} finally {
			setLoading(false);
		}
	};

	onMount(() => {
		void load(false);
		apiCall("Activity.admins")
			.then((res) => "data" in res && setAdmins(res.data))
			.catch(() => {});
	});

	const days = createMemo(() => {
		const groups: { day: string; rows: Row[] }[] = [];
		for (const row of rows()) {
			const day = dayLabel(row.created_at);
			const last = groups[groups.length - 1];
			if (last?.day === day) last.rows.push(row);
			else groups.push({ day, rows: [row] });
		}
		return groups;
	});

	return (
		<PanelPage title="Ιστορικό ενεργειών" subtitle="Ποιος διαχειριστής άλλαξε τι — οι πιο πρόσφατες αλλαγές πρώτα.">
			<section class={`${cardClass} flex flex-wrap items-end gap-4 p-4 sm:p-5`} aria-label="Φίλτρα">
				<label class="grid gap-1 min-w-[14rem] flex-1">
					<span class="text-sm font-bold">Διαχειριστής</span>
					<select
						class={inputClass}
						value={admin()}
						onChange={(e) => {
							setAdmin(e.currentTarget.value);
							void load(false);
						}}>
						<option value="">Όλοι</option>
						<For each={admins()}>{(email) => <option value={email}>{email}</option>}</For>
					</select>
				</label>
				<label class="grid gap-1 min-w-[12rem] flex-1">
					<span class="text-sm font-bold">Κατηγορία</span>
					<select
						class={inputClass}
						value={category()}
						onChange={(e) => {
							setCategory(e.currentTarget.value);
							void load(false);
						}}>
						<option value="">Όλες</option>
						<For each={CATEGORIES}>{(name) => <option value={name}>{name}</option>}</For>
					</select>
				</label>
			</section>

			<Show when={!loading() || rows().length > 0} fallback={<p class={hintClass}>Φόρτωση…</p>}>
				<Show
					when={rows().length > 0}
					fallback={
						<div class={`${cardClass} grid place-items-center gap-2 p-10 text-center`}>
							<i class="fa-solid fa-clock-rotate-left text-3xl text-accent-ink/60" aria-hidden="true"></i>
							<p class={hintClass}>Δεν υπάρχουν καταγεγραμμένες ενέργειες{admin() || category() ? " με αυτά τα φίλτρα" : " ακόμη"}.</p>
						</div>
					}>
					<For each={days()}>
						{(group) => (
							<section class={`${cardClass} overflow-hidden`} aria-label={group.day}>
								<h2 class="sticky top-0 z-10 border-b border-line bg-surface-muted/95 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-accent-ink backdrop-blur">
									{group.day}
								</h2>
								<ol class="divide-y divide-line">
									<For each={group.rows}>
										{(row) => {
											const groupName = row.endpoint.split(".")[0]!;
											return (
												<li class="flex gap-3 px-5 py-3">
													<span
														class={
															"mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm " +
															(isDeletion(row.endpoint) ? "bg-accent-soft text-danger" : "bg-accent-soft text-accent-ink")
														}
														aria-hidden="true">
														<i class={`fa-solid ${GROUP_ICONS[groupName] ?? "fa-pen"}`}></i>
													</span>
													<div class="grid min-w-0 flex-1 gap-0.5">
														<p class="font-bold">
															{row.label}
															<Show when={row.summary}>
																<span class="font-normal text-ink-muted"> — {row.summary}</span>
															</Show>
														</p>
														<p class="text-sm text-ink-muted break-all">
															<time datetime={new Date(row.created_at).toISOString()}>{timeLabel(row.created_at)}</time> ·{" "}
															{row.user_email} · {ACTIVITY_GROUPS[groupName] ?? groupName}
														</p>
													</div>
												</li>
											);
										}}
									</For>
								</ol>
							</section>
						)}
					</For>
					<Show when={next() !== null}>
						<button type="button" class={`${secondaryButtonClass} justify-self-center`} disabled={loading()} onClick={() => load(true)}>
							{loading() ? "Φόρτωση…" : "Περισσότερα"}
						</button>
					</Show>
				</Show>
			</Show>
		</PanelPage>
	);
}
