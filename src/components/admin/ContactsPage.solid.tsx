import { apiCall } from "@hooks/apiCall";
import type { APIResponse } from "@routes/index.client";
import { For, Show, createSignal, onMount, type JSX } from "solid-js";
import { Badge, PanelCard, PanelPage, cardClass, hintClass, primaryButtonClass, secondaryButtonClass } from "./Panel.solid";
import { toast } from "./toast";
import Icon from "@components/other/Icon.solid";

/**
 * «Επαφές Google» (sysadmin + owner): keeps the contacts of the school's Google account (the one on the
 * secretariat's phone) in sync with the Μαθητολόγιο, through the People API (lib/contacts/). Replaces the
 * yearly `.vcf` imports: one contact per phone number, updated in place, labelled «Σχολή · …».
 */

type Status = APIResponse["GoogleContacts.status"];
type Preview = APIResponse["GoogleContacts.preview"];
type Summary = APIResponse["GoogleContacts.apply"];

const dateTime = (ms: number) => new Date(ms).toLocaleString("el-GR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function Stat(props: { label: string; value: number; tone?: "danger" | "muted" }) {
	return (
		<div class="rounded-xl border border-line bg-surface-muted px-3 py-2">
			<p class={`text-2xl font-bold ${props.tone === "danger" && props.value > 0 ? "text-danger" : props.tone === "muted" ? "text-ink-muted" : ""}`}>
				{props.value}
			</p>
			<p class={hintClass}>{props.label}</p>
		</div>
	);
}

/** A folded list of the plan's items. */
function Items<T>(props: { title: string; items: T[]; hint?: string; children: (item: T) => JSX.Element }) {
	return (
		<Show when={props.items.length > 0}>
			<details class="rounded-xl border border-line">
				<summary class="cursor-pointer select-none px-3 py-2 font-bold hover:bg-surface-muted rounded-xl">
					{props.title} <span class="text-ink-muted">({props.items.length})</span>
				</summary>
				<div class="grid gap-2 px-3 pb-3">
					<Show when={props.hint}>
						<p class={hintClass}>{props.hint}</p>
					</Show>
					<ul class="grid gap-1 text-sm max-h-80 overflow-y-auto">
						<For each={props.items}>{(item) => <li class="border-b border-line/60 py-1 last:border-b-0">{props.children(item)}</li>}</For>
					</ul>
				</div>
			</details>
		</Show>
	);
}

export default function ContactsPage() {
	const [status, setStatus] = createSignal<Status | null>(null);
	const [preview, setPreview] = createSignal<Preview | null>(null);
	const [result, setResult] = createSignal<Summary | null>(null);
	const [deleteDuplicates, setDeleteDuplicates] = createSignal(true);
	const [busy, setBusy] = createSignal<"" | "connect" | "preview" | "apply" | "disconnect">("");

	const loadStatus = async () => {
		try {
			const res = await apiCall("GoogleContacts.status");
			if ("data" in res) setStatus(res.data);
		} catch (error) {
			toast.error(error, { title: "Αποτυχία φόρτωσης" });
		}
	};

	onMount(() => {
		void loadStatus();
		// Back from Google (lib/contacts/link.server.ts → `?connected=1`).
		const params = new URLSearchParams(window.location.search);
		if (params.get("connected")) {
			toast.success("Ο λογαριασμός Google συνδέθηκε. Δείτε τώρα την προεπισκόπηση των αλλαγών.", { title: "Επαφές Google" });
			window.history.replaceState(window.history.state, "", window.location.pathname);
		}
	});
	// Back from Google with the browser's back button: the page comes from the bfcache with the button still busy.
	window.addEventListener("pageshow", () => setBusy(""));

	const connect = async () => {
		setBusy("connect");
		try {
			const res = await apiCall("GoogleContacts.connect");
			if ("data" in res) window.location.assign(res.data.OAuthUrl);
		} catch (error) {
			toast.error(error, { title: "Αποτυχία σύνδεσης" });
			setBusy("");
		}
	};

	const disconnect = async () => {
		if (!window.confirm("Αποσύνδεση του λογαριασμού Google; Οι επαφές του δεν θα αλλάξουν, αλλά ο συγχρονισμός σταματά μέχρι να τον συνδέσετε ξανά."))
			return;
		setBusy("disconnect");
		try {
			await apiCall("GoogleContacts.disconnect");
			setPreview(null);
			await loadStatus();
		} catch (error) {
			toast.error(error, { title: "Αποτυχία αποσύνδεσης" });
		} finally {
			setBusy("");
		}
	};

	const loadPreview = async () => {
		setBusy("preview");
		setResult(null);
		try {
			const res = await apiCall("GoogleContacts.preview");
			if ("data" in res) setPreview(res.data);
		} catch (error) {
			toast.error(error, { title: "Αποτυχία προεπισκόπησης" });
			await loadStatus();
		} finally {
			setBusy("");
		}
	};

	const apply = async () => {
		const p = preview();
		if (!p) return;
		const deletions = p.counts.remove + (deleteDuplicates() ? p.counts.duplicates : 0);
		const message =
			`Εφαρμογή στον λογαριασμό ${p.account_email}:\n` +
			`• ${p.counts.create} νέες επαφές\n• ${p.counts.update} ενημερώσεις\n• ${deletions} διαγραφές\n\n` +
			"Πριν από τις αλλαγές κρατείται αντίγραφο όλων των επαφών. Συνέχεια;";
		if (!window.confirm(message)) return;
		setBusy("apply");
		try {
			const res = await apiCall("GoogleContacts.apply", { RequestObject: { hash: p.hash, deleteDuplicates: deleteDuplicates() } });
			if ("data" in res) {
				setResult(res.data);
				toast.success("Οι επαφές συγχρονίστηκαν. Στο κινητό εμφανίζονται μόλις συγχρονιστεί ο λογαριασμός Google.", { title: "Επαφές Google" });
			}
			setPreview(null);
		} catch (error) {
			toast.error(error, { title: "Αποτυχία συγχρονισμού" });
		} finally {
			setBusy("");
			await loadStatus();
		}
	};

	const link = () => status()?.link ?? null;

	return (
		<PanelPage title="Επαφές Google" subtitle="Οι επαφές του κινητού της σχολής, ενημερωμένες από το Μαθητολόγιο και τους καθηγητές — χωρίς αρχεία .vcf.">
			<Show when={status()} fallback={<p class={hintClass}>Φόρτωση…</p>}>
				<PanelCard
					icon="link"
					title="Λογαριασμός Google"
					description="Ο λογαριασμός Google στον οποίο είναι συνδεδεμένο το κινητό της Γραμματείας."
					aside={
						<Show when={link()}>
							<Badge tone={link()!.status === "ok" ? "success" : "neutral"}>
								{link()!.status === "ok" ? "Συνδεδεμένος" : "Χρειάζεται σύνδεση"}
							</Badge>
						</Show>
					}>
					<Show
						when={status()!.available}
						fallback={<p class={hintClass}>Η σύνδεση με Google δεν είναι ρυθμισμένη σε αυτό το περιβάλλον (GOOGLE_CLIENT_ID).</p>}>
						<Show
							when={link()}
							fallback={
								<div class="grid gap-3">
									<p>
										Πατήστε «Σύνδεση» και επιλέξτε <b>τον λογαριασμό του κινητού της σχολής</b> (όχι τον δικό σας). Στη σελίδα της Google
										επιτρέψτε την πρόσβαση στις επαφές.
									</p>
									<button type="button" class={primaryButtonClass} disabled={busy() !== ""} onClick={connect}>
										<Icon name={busy() === "connect" ? "spinner" : "log-in"} spin={busy() === "connect"} />
										Σύνδεση λογαριασμού Google
									</button>
								</div>
							}>
							<div class="grid gap-3">
								<p class="font-bold wrap-anywhere">{link()!.account_email}</p>
								<p class={hintClass}>
									Συνδέθηκε από {link()!.connected_by} στις {dateTime(link()!.connected_at)}.
								</p>
								<Show when={link()!.status === "expired"}>
									<p class="rounded-xl bg-amber-100 px-3 py-2 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
										Η Google ανακάλεσε την πρόσβαση (ή έληξε: όσο η εφαρμογή είναι σε «Testing», λήγει κάθε 7 ημέρες). Συνδέστε ξανά τον
										λογαριασμό.
									</p>
								</Show>
								<div class="flex flex-wrap gap-2">
									<button
										type="button"
										class={link()!.status === "expired" ? primaryButtonClass : secondaryButtonClass}
										disabled={busy() !== ""}
										onClick={connect}>
										<Icon name="log-in" />
										{link()!.status === "expired" ? "Σύνδεση ξανά" : "Αλλαγή λογαριασμού"}
									</button>
									<button type="button" class={secondaryButtonClass} disabled={busy() !== ""} onClick={disconnect}>
										<Icon name="log-out" />
										Αποσύνδεση
									</button>
								</div>
							</div>
						</Show>
					</Show>
				</PanelCard>

				<Show when={link()?.status === "ok"}>
					<PanelCard
						icon="address-book"
						title="Συγχρονισμός"
						description="Μία επαφή για κάθε αριθμό τηλεφώνου του Μαθητολογίου και των καθηγητών, με όλους όσοι τον έχουν δηλώσει, ετικέτες «Σχολή · …» και σημείωση με ΑΜ και τμήματα. Ο αριθμός ενός καθηγητή παίρνει το όνομά του.">
						<Show when={link()!.last_sync_at}>
							<p class={hintClass}>
								Τελευταίος συγχρονισμός: {dateTime(link()!.last_sync_at!)} από {link()!.last_sync_by}
								<Show when={link()!.last_sync_summary}>
									{(s) => (
										<>
											{" "}
											— {s().created} νέες, {s().updated} ενημερώσεις, {s().removed + s().duplicatesRemoved} διαγραφές
											<Show when={s().error}> (διακόπηκε: {s().error})</Show>
										</>
									)}
								</Show>
							</p>
						</Show>
						<div>
							<button type="button" class={primaryButtonClass} disabled={busy() !== ""} onClick={loadPreview}>
								<Icon name={busy() === "preview" ? "spinner" : "eye"} spin={busy() === "preview"} />
								{preview() ? "Νέα προεπισκόπηση" : "Προεπισκόπηση αλλαγών"}
							</button>
						</div>

						<Show when={result()}>
							{(r) => (
								<div class={`${cardClass} grid gap-1 p-4`}>
									<p class="font-bold">
										<Icon name="check-circle" class="text-green-700 dark:text-green-300" /> Ολοκληρώθηκε
									</p>
									<p class={hintClass}>
										{r().created} νέες επαφές, {r().updated} ενημερώσεις, {r().removed} διαγραφές
										{r().duplicatesRemoved ? `, ${r().duplicatesRemoved} διπλότυπα διαγράφηκαν` : ""}
										{r().labelsCreated ? `, ${r().labelsCreated} νέες ετικέτες` : ""}.
									</p>
									<p class={hintClass}>
										Αντίγραφο των επαφών πριν από τις αλλαγές: <code class="wrap-anywhere">{r().backup}</code>. Όσες διαγράφηκαν βρίσκονται
										και στον Κάδο των Επαφών Google για 30 ημέρες.
									</p>
								</div>
							)}
						</Show>

						<Show when={preview()}>
							{(p) => (
								<div class="grid gap-4">
									<p class={hintClass}>
										Λογαριασμός {p().account_email} — {p().contactsTotal} επαφές σήμερα.
										<Show when={p().newLabels.length > 0}> Θα δημιουργηθούν οι ετικέτες: {p().newLabels.join(", ")}.</Show>
									</p>
									<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
										<Stat label="νέες επαφές" value={p().counts.create} />
										<Stat label={`ενημερώσεις (${p().counts.adopted} από παλιές εισαγωγές)`} value={p().counts.update} />
										<Stat label="χωρίς αλλαγή" value={p().counts.unchanged} tone="muted" />
										<Stat label="διαγραφές" value={p().counts.remove} tone="danger" />
										<Stat label="διπλότυπα" value={p().counts.duplicates} tone="danger" />
										<Stat label="κοινοί αριθμοί (εκτός)" value={p().counts.excluded} tone="danger" />
										<Stat label="χωρίς τηλέφωνο" value={p().counts.noPhone} tone="muted" />
										<Stat label="επαφές τρίτων με ίδιο αριθμό" value={p().counts.untouchedShared} tone="muted" />
									</div>

									<div class="grid gap-2">
										<Items title="Νέες επαφές" items={p().create}>
											{(c) => (
												<>
													<b>{c.name}</b> · {c.phone}
													<Show when={c.people.length > 1}>
														<span class="text-ink-muted"> — {c.people.join(", ")}</span>
													</Show>
												</>
											)}
										</Items>
										<Items
											title="Ενημερώσεις"
											items={p().update}
											hint="«Παλιά εισαγωγή»: επαφή από προηγούμενο .vcf που αναλαμβάνει πλέον ο συγχρονισμός — το όνομά της αλλάζει όπως φαίνεται.">
											{(u) => (
												<>
													<Show when={u.from !== u.to} fallback={<b>{u.to}</b>}>
														{u.from} → <b>{u.to}</b>
													</Show>{" "}
													· {u.phone} <span class="text-ink-muted">({u.changes.join(", ")})</span>
													<Show when={u.adopted}>
														{" "}
														<Badge>παλιά εισαγωγή</Badge>
													</Show>
												</>
											)}
										</Items>
										<Items
											title="Διαγραφές"
											items={p().remove}
											hint="Επαφές του συγχρονισμού που ο αριθμός τους δεν υπάρχει πια στο Μαθητολόγιο.">
											{(r) => (
												<>
													<b>{r.name}</b> · {r.phones.join(", ")}
												</>
											)}
										</Items>
										<Items
											title="Διπλότυπα"
											items={p().duplicates}
											hint="Επιπλέον αντίγραφα του ίδιου αριθμού (συνήθως από παλιές εισαγωγές .vcf). Κρατείται μία επαφή ανά αριθμό.">
											{(r) => (
												<>
													<b>{r.name}</b> · {r.phones.join(", ")}
												</>
											)}
										</Items>
										<Items
											title="Κοινοί αριθμοί — εκτός συγχρονισμού"
											items={p().excluded}
											hint="Αριθμοί δηλωμένοι σε πάρα πολλούς μαθητές: δεν είναι οικογένεια (π.χ. αριθμός καθηγητή ή της σχολής). Διορθώστε τα τηλέφωνα στο Μαθητολόγιο.">
											{(e) => (
												<>
													<b>{e.phone}</b> <span class="text-ink-muted">— {e.pupils.join(", ")}</span>
												</>
											)}
										</Items>
										<Items title="Χωρίς τηλέφωνο (μαθητές και καθηγητές)" items={p().noPhone}>
											{(n) => <>{n}</>}
										</Items>
										<Items
											title="Επαφές τρίτων με ίδιο αριθμό"
											items={p().untouchedShared}
											hint="Επαφές που έχουν και άλλους αριθμούς (π.χ. καθηγητής που είναι και γονέας). Δεν αλλάζουν.">
											{(r) => (
												<>
													<b>{r.name}</b> · {r.phones.join(", ")}
												</>
											)}
										</Items>
									</div>

									<Show when={p().counts.duplicates > 0}>
										<label class="flex cursor-pointer items-center gap-2">
											<input
												type="checkbox"
												class="size-4 cursor-pointer accent-brand"
												checked={deleteDuplicates()}
												onChange={(e) => setDeleteDuplicates(e.currentTarget.checked)}
											/>
											Διαγραφή και των {p().counts.duplicates} διπλότυπων
										</label>
									</Show>
									<Show
										when={p().counts.create + p().counts.update + p().counts.remove + (deleteDuplicates() ? p().counts.duplicates : 0) > 0}
										fallback={<p class={hintClass}>Οι επαφές είναι ήδη ενημερωμένες.</p>}>
										<button type="button" class={primaryButtonClass} disabled={busy() !== ""} onClick={apply}>
											<Icon name={busy() === "apply" ? "spinner" : "check"} spin={busy() === "apply"} />
											Εφαρμογή αλλαγών
										</button>
									</Show>
								</div>
							)}
						</Show>
					</PanelCard>

					<PanelCard icon="smartphone" title="Στο κινητό" description="Για να φαίνονται σωστά οι επαφές στο κινητό της Γραμματείας.">
						<ul class="grid list-disc gap-1.5 pl-5">
							<li>
								Ρυθμίσεις → Λογαριασμοί → Google → <b>{link()!.account_email}</b>: ενεργός ο συγχρονισμός «Επαφές».
							</li>
							<li>
								Σβήστε τις παλιές εισαγωγές .vcf που αποθηκεύτηκαν <b>στη συσκευή</b> ή στη SIM (Επαφές → εμφάνιση επαφών από
								«Τηλέφωνο/Συσκευή»): ο συγχρονισμός βλέπει μόνο όσες είναι στον λογαριασμό Google.
							</li>
							<li>
								Μην αλλάζετε στο κινητό τις επαφές με ετικέτα «Σχολή · Μαθητολόγιο»: διορθώστε τα στοιχεία στο Μαθητολόγιο και συγχρονίστε ξανά.
							</li>
						</ul>
					</PanelCard>
				</Show>
			</Show>
		</PanelPage>
	);
}
