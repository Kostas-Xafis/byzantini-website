import type { Instruments, PupilEnrollments, Teachers } from "@_types/entities";
import { apiCall } from "@hooks/apiCall";
import { classYearLabel, EVALUATION_LABEL } from "@lib/classYears";
import { currentSchoolYear } from "@lib/pupils/years";
import { API } from "@routes/index.client";
import { For, Show, createEffect, createMemo, createSignal, on } from "solid-js";
import Dialog, { DialogCloseButton } from "../other/Dialog.solid";
import Spinner from "../other/Spinner.solid";
import { toast } from "./Alert.solid";
import {
	confirmSettle,
	discountLabel,
	euro,
	EvaluationBadge,
	FeeManualMarker,
	fromDateValue,
	paymentUpdateBody,
	toDateValue,
	todayTimestamp,
	type PreviewRow,
} from "./controls/Registrations/EnrollmentFeeFields.solid";
import Icon from "@components/other/Icon.solid";

/**
 * «Δίδακτρα μαθητή» — one school year of a pupil at a glance (Μαθητολόγιο): every registration in discount
 * order with its price breakdown and payment, per-row payment / price editing and «Εξόφληση», «Εξόφληση όλων»
 * (`Pupils.settleYear`, one statement) and the year's totals.
 *
 * Breakdown (factor, position, class price, catalog price) comes from `Pupils.previewFees` for the stored
 * pupil-year; the money (total, paid, date) from the stored rows the page already holds (`Pupils.get`). After a
 * save `onSaved` reloads the record, which refreshes both.
 */

const DEPARTMENTS = ["Βυζαντινή", "Παραδοσιακή", "Ευρωπαϊκή"];

type Props = {
	open: boolean;
	onClose: () => void;
	/** Reloads the pupil record (the enrollments below) after a save. */
	onSaved: () => Promise<void>;
	pupil: { id: number; name: string; am: string };
	enrollments: PupilEnrollments[];
	teachers: Teachers[];
	instruments: Instruments[];
};

type FeeRow = { enrollment: PupilEnrollments; preview: PreviewRow | null };

const TITLE_ID = "pupil-fees-title";

const cellInput =
	"w-28 rounded-md border-2 border-ink-muted bg-surface px-2 py-1 font-didact text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink";
const smallButton =
	"whitespace-nowrap rounded-md border border-brand px-2 py-1 text-sm transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

const sortYearsDesc = (years: Iterable<string>) => [...new Set(years)].sort((a, b) => b.localeCompare(a));

export default function PupilFeesDialog(props: Props) {
	const pupilYears = () => sortYearsDesc(props.enrollments.map((enrollment) => enrollment.registration_year));
	const yearOptions = () => sortYearsDesc([...pupilYears(), currentSchoolYear()]);
	/** The current school year, or the newest the pupil has when they have none in it. */
	const defaultYear = () => {
		const current = currentSchoolYear();
		const years = pupilYears();
		return years.includes(current) || years.length === 0 ? current : years[0];
	};
	const [year, setYear] = createSignal(defaultYear());
	// Every time the dialog opens it starts on the default year.
	createEffect(
		on(
			() => props.open,
			(open) => open && setYear(defaultYear()),
		),
	);

	const stored = createMemo(() => props.enrollments.filter((enrollment) => enrollment.registration_year === year()));

	// ---- breakdown of the stored pupil-year
	const [preview, setPreview] = createSignal<PreviewRow[] | null>(null);
	const [previewError, setPreviewError] = createSignal<string | null>(null);
	const [loading, setLoading] = createSignal(false);
	let seq = 0;
	createEffect(
		on([() => props.open, year, () => props.enrollments], async ([open, selectedYear]) => {
			if (!open) return;
			const mine = ++seq;
			setLoading(true);
			try {
				const res = await apiCall(API.Pupils.previewFees, { RequestObject: { pupil_id: props.pupil.id, registration_year: selectedYear } });
				if (mine !== seq) return;
				setPreview("data" in res ? res.data.rows : null);
				setPreviewError(null);
			} catch (error) {
				if (mine !== seq) return;
				setPreview(null);
				setPreviewError(error instanceof Error ? error.message : "Σφάλμα κατά τον υπολογισμό των διδάκτρων");
			} finally {
				if (mine === seq) setLoading(false);
			}
		}),
	);

	/** Stored rows in discount order (the preview's order; stored order when the preview is unavailable). */
	const rows = createMemo<FeeRow[]>(() => {
		const list = stored();
		const order = preview();
		if (!order) return list.map((enrollment) => ({ enrollment, preview: null }));
		const byId = new Map(order.map((row, index) => [row.id, { row, index }]));
		return list
			.map((enrollment) => ({
				enrollment,
				preview: byId.get(enrollment.id)?.row ?? null,
				index: byId.get(enrollment.id)?.index ?? Number.MAX_SAFE_INTEGER,
			}))
			.sort((a, b) => a.index - b.index || a.enrollment.id - b.enrollment.id)
			.map(({ enrollment, preview }) => ({ enrollment, preview }));
	});

	const totals = createMemo(() => {
		let classes = 0;
		let evaluation = 0;
		let total = 0;
		let paid = 0;
		for (const { enrollment } of rows()) {
			classes += enrollment.total_payment - enrollment.evaluation_fee;
			evaluation += enrollment.evaluation_fee;
			total += enrollment.total_payment;
			paid += enrollment.payment_amount;
		}
		return { classes, evaluation, total, paid, balance: total - paid };
	});

	const owing = createMemo(() => rows().filter(({ enrollment }) => enrollment.total_payment > enrollment.payment_amount));

	// ---- saves
	const [busy, setBusy] = createSignal(false);
	const [editingId, setEditingId] = createSignal<number | null>(null);
	createEffect(on(year, () => setEditingId(null)));

	const run = async (work: () => Promise<string>) => {
		if (busy()) return;
		setBusy(true);
		try {
			const message = await work();
			await props.onSaved();
			toast.success(message);
			setEditingId(null);
		} catch (error) {
			toast.error(error instanceof Error ? error : String(error), { title: "Αποτυχία αποθήκευσης" });
		} finally {
			setBusy(false);
		}
	};

	const savePayment = (enrollment: PupilEnrollments, payment: Parameters<typeof paymentUpdateBody>[1], message: string) =>
		run(async () => {
			await apiCall(API.Pupils.updateEnrollment, { RequestObject: paymentUpdateBody(enrollment, payment) });
			return message;
		});

	const settleOne = (enrollment: PupilEnrollments) => {
		if (!confirmSettle(enrollment.payment_amount, enrollment.total_payment)) return;
		void savePayment(
			enrollment,
			{
				total_payment: enrollment.total_payment,
				fee_manual: enrollment.fee_catalog_id !== null ? enrollment.fee_manual : undefined,
				payment_amount: enrollment.total_payment,
				payment_date: todayTimestamp(),
			},
			"Η εγγραφή εξοφλήθηκε",
		);
	};

	const rowTitle = (enrollment: PupilEnrollments) => `${DEPARTMENTS[enrollment.class_id] ?? "-"} — ${instrumentName(enrollment.instrument_id)}`;

	const settleAll = () => {
		const list = owing();
		if (list.length === 0) return;
		const lines = list.map(({ enrollment }) => `• ${rowTitle(enrollment)}: ${euro(enrollment.payment_amount)} → ${euro(enrollment.total_payment)}`);
		if (!window.confirm(`Εξόφληση όλων για ${year()} με σημερινή ημερομηνία:\n\n${lines.join("\n")}\n\nΣυνέχεια;`)) return;
		void run(async () => {
			const res = await apiCall(API.Pupils.settleYear, {
				RequestObject: { pupil_id: props.pupil.id, registration_year: year(), payment_date: todayTimestamp() },
			});
			const count = "data" in res ? res.data.updated.length : list.length;
			return count === 1 ? "Εξοφλήθηκε 1 εγγραφή" : `Εξοφλήθηκαν ${count} εγγραφές`;
		});
	};

	const teacherName = (id: number) => props.teachers.find((teacher) => teacher.id === id)?.fullname ?? "-";
	const instrumentName = (id: number) => props.instruments.find((instrument) => instrument.id === id)?.name ?? (id === 0 ? "Χωρίς όργανο" : `#${id}`);

	return (
		<Dialog
			open={props.open}
			onClose={props.onClose}
			labelledBy={TITLE_ID}
			closeOnBackdrop={() => !busy()}
			backdropClass="modal fixed z-[5000] inset-0 w-full h-full bg-[rgb(120_120_120_/_0.35)] dark:bg-[rgb(0_0_0_/_0.6)] grid drop-shadow-[-1px_1px_2px_rgba(0,0,0,0.25)] backdrop-blur-sm"
			class="relative grid max-h-[90vh] w-[min(1200px,95vw)] grid-rows-[max-content_1fr] gap-y-4 place-self-center rounded-md bg-surface p-6 font-didact text-ink shadow-lg shadow-shade focus-visible:outline-hidden max-sm:max-h-[85dvh] max-sm:p-3">
			<div class="grid gap-y-3 pr-8">
				<h2 id={TITLE_ID} class="font-anaktoria text-3xl max-sm:text-2xl">
					Δίδακτρα μαθητή
				</h2>
				<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-lg">
					<span class="font-semibold">
						{props.pupil.name} <span class="font-normal text-ink-muted">(ΑΜ {props.pupil.am})</span>
					</span>
					<label class="flex items-center gap-x-2">
						Σχολικό έτος
						<select
							value={year()}
							onChange={(e) => setYear(e.currentTarget.value)}
							class="rounded-md border-2 border-ink-muted bg-surface px-2 py-1 text-lg">
							<For each={yearOptions()}>{(option) => <option value={option}>{option}</option>}</For>
						</select>
					</label>
					<Show when={loading() || busy()}>
						<Icon name="spinner" class="text-accent-ink" spin />
						<span class="sr-only">Φόρτωση…</span>
					</Show>
				</div>
			</div>

			<div class="grid min-h-0 gap-y-4 overflow-y-auto" aria-busy={loading() || busy() ? "true" : "false"}>
				<Show
					when={rows().length > 0}
					fallback={<p class="py-10 text-center text-lg text-ink-muted">Δεν υπάρχουν εγγραφές για το σχολικό έτος {year()}.</p>}>
					<Show when={previewError()}>
						<p class="text-base text-danger">{previewError()}</p>
					</Show>
					<div class="overflow-x-auto">
						<table class="w-full min-w-[960px] border-collapse text-base">
							<caption class="sr-only">Εγγραφές και δίδακτρα του σχολικού έτους {year()}, με τη σειρά των εκπτώσεων</caption>
							<thead>
								<tr class="bg-accent-soft text-left [&>th]:px-2 [&>th]:py-1.5 [&>th]:font-semibold">
									<th scope="col">Τμήμα / Όργανο</th>
									<th scope="col">Τάξη</th>
									<th scope="col">Καθηγητής</th>
									<th scope="col" class="text-right">
										Τιμή τμήματος
									</th>
									<th scope="col">Έκπτωση</th>
									<th scope="col" class="text-right">
										Τέλος κατάταξης
									</th>
									<th scope="col" class="text-right">
										Σύνολο
									</th>
									<th scope="col" class="text-right">
										Πληρώθηκαν
									</th>
									<th scope="col">Ημ/νία πληρωμής</th>
									<th scope="col" class="text-right">
										Υπόλοιπο
									</th>
									<th scope="col">
										<span class="sr-only">Ενέργειες</span>
									</th>
								</tr>
							</thead>
							<tbody>
								<For each={rows()}>
									{({ enrollment, preview: fee }) => {
										const balance = () => enrollment.total_payment - enrollment.payment_amount;
										const pinned = enrollment.fee_catalog_id !== null;
										return (
											<>
												<tr class="border-t border-line align-top [&>td]:px-2 [&>td]:py-2">
													<th scope="row" class="px-2 py-2 text-left font-normal">
														<span class="font-semibold">{DEPARTMENTS[enrollment.class_id] ?? "-"}</span>
														<br />
														<span class="text-ink-muted">{instrumentName(enrollment.instrument_id)}</span>
													</th>
													<td class="whitespace-nowrap">
														<Show
															when={enrollment.evaluation && !enrollment.class_year}
															fallback={
																<>
																	{classYearLabel(enrollment.class_year, enrollment.evaluation) || "-"}
																	<Show when={enrollment.evaluation}>
																		<EvaluationBadge />
																	</Show>
																</>
															}>
															<span class="rounded-full bg-amber-200 px-2 py-0.5 text-sm font-bold text-amber-900 dark:bg-amber-700 dark:text-amber-50">
																{EVALUATION_LABEL}
															</span>
														</Show>
													</td>
													<td>{teacherName(enrollment.teacher_id)}</td>
													<td class="text-right tabular-nums">
														{pinned && fee ? (fee.fee_base === null ? "—" : euro(fee.fee_base)) : "—"}
													</td>
													<td class="whitespace-nowrap">{pinned && fee ? discountLabel(fee) : "—"}</td>
													<td class="text-right tabular-nums">
														{enrollment.evaluation_fee > 0 ? euro(enrollment.evaluation_fee) : "—"}
													</td>
													<td class="whitespace-nowrap text-right font-semibold tabular-nums">
														{euro(enrollment.total_payment)}
														<Show when={enrollment.fee_manual}>
															<span class="ml-1">
																<FeeManualMarker compact />
															</span>
														</Show>
													</td>
													<td class="text-right tabular-nums">{euro(enrollment.payment_amount)}</td>
													<td class="whitespace-nowrap tabular-nums">
														{enrollment.payment_date ? new Date(enrollment.payment_date).toLocaleDateString("el-GR") : "-"}
													</td>
													<td
														class={
															"text-right font-semibold tabular-nums " +
															(balance() > 0 ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300")
														}>
														{balance() > 0 ? euro(balance()) : "Εξοφλήθηκε"}
													</td>
													<td>
														<div class="flex flex-wrap justify-end gap-1">
															<button
																type="button"
																class={smallButton}
																disabled={busy()}
																aria-expanded={editingId() === enrollment.id ? "true" : "false"}
																aria-controls={`fees-edit-${enrollment.id}`}
																aria-label={`Επεξεργασία τιμής και πληρωμής: ${rowTitle(enrollment)}`}
																onClick={() => setEditingId(editingId() === enrollment.id ? null : enrollment.id)}>
																<Icon name="edit" class="mr-1" />
																Επεξεργασία
															</button>
															<button
																type="button"
																class={smallButton}
																disabled={busy() || balance() <= 0}
																aria-label={`Εξόφληση: ${rowTitle(enrollment)}`}
																onClick={() => settleOne(enrollment)}>
																<Icon name="check-double" class="mr-1" />
																Εξόφληση
															</button>
														</div>
													</td>
												</tr>
												<Show when={editingId() === enrollment.id}>
													<tr id={`fees-edit-${enrollment.id}`} class="bg-surface-muted">
														<td colSpan={11} class="px-2 py-3">
															<RowEditor
																enrollment={enrollment}
																catalogTotal={pinned ? (fee?.catalog_total ?? null) : null}
																busy={busy()}
																onCancel={() => setEditingId(null)}
																onSave={(payment) => savePayment(enrollment, payment, "Επιτυχής ενημέρωση πληρωμής")}
															/>
														</td>
													</tr>
												</Show>
											</>
										);
									}}
								</For>
							</tbody>
						</table>
					</div>
				</Show>

				{/* totals */}
				<div class="flex flex-wrap items-end justify-between gap-4">
					<dl class="grid min-w-[260px] grid-cols-[auto_auto] gap-x-8 gap-y-1 rounded-lg bg-accent-soft px-4 py-3 text-lg [&_dd]:text-right [&_dd]:tabular-nums [&_dt]:text-ink-muted">
						<dt>Δίδακτρα τμημάτων</dt>
						<dd>{euro(totals().classes)}</dd>
						<dt>Τέλη κατάταξης</dt>
						<dd>{euro(totals().evaluation)}</dd>
						<dt class="border-t border-line pt-1 font-semibold text-ink!">Γενικό σύνολο</dt>
						<dd class="border-t border-line pt-1 font-semibold">{euro(totals().total)}</dd>
						<dt>Πληρώθηκαν</dt>
						<dd>{euro(totals().paid)}</dd>
						<dt class="font-semibold text-ink!">Υπόλοιπο</dt>
						<dd class={"font-semibold " + (totals().balance > 0 ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300")}>
							{euro(totals().balance)}
						</dd>
					</dl>
					<button
						type="button"
						disabled={busy() || owing().length === 0}
						onClick={settleAll}
						class="rounded-md bg-emerald-700 px-4 py-2 text-lg text-white shadow-md transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500">
						<Icon name="check-double" class="mr-2" />
						Εξόφληση όλων
					</button>
				</div>
				<Show when={loading() && rows().length === 0}>
					<Spinner />
				</Show>
			</div>
			<DialogCloseButton class="absolute top-4 right-4 h-[1.5rem] w-[1.5rem] text-xl max-sm:h-8 max-sm:w-8 max-sm:text-lg" onClick={props.onClose} />
		</Dialog>
	);
}

/**
 * Inline editor of one row: total («Ειδική τιμή» / «Επαναφορά τιμής καταλόγου», same rule as the payment modal),
 * paid amount and payment date.
 */
function RowEditor(props: {
	enrollment: PupilEnrollments;
	/** The catalog price (null when no catalog is pinned: the total is plain). */
	catalogTotal: number | null;
	busy: boolean;
	onCancel: () => void;
	onSave: (payment: { total_payment: number; fee_manual?: boolean; payment_amount: number; payment_date: number | null }) => void;
}) {
	const enrollment = props.enrollment;
	const pinned = enrollment.fee_catalog_id !== null;
	const uid = `fees-row-${enrollment.id}`;
	const [total, setTotal] = createSignal(enrollment.total_payment);
	const [paid, setPaid] = createSignal(enrollment.payment_amount);
	const [date, setDate] = createSignal(toDateValue(enrollment.payment_date));
	const [touched, setTouched] = createSignal(false);
	const manual = () => {
		if (!pinned) return false;
		if (!touched() || props.catalogTotal === null) return enrollment.fee_manual;
		return total() !== props.catalogTotal;
	};

	const save = (e: SubmitEvent) => {
		e.preventDefault();
		if (!Number.isInteger(total()) || total() < 0 || !Number.isInteger(paid()) || paid() < 0) {
			toast.error("Τα ποσά πρέπει να είναι ακέραιοι θετικοί αριθμοί");
			return;
		}
		props.onSave({
			total_payment: total(),
			fee_manual: pinned ? manual() : undefined,
			payment_amount: paid(),
			payment_date: fromDateValue(date()),
		});
	};

	return (
		<form class="flex flex-wrap items-end gap-4" onSubmit={save} aria-label="Τιμή και πληρωμή εγγραφής">
			<label class="grid gap-y-1 text-sm">
				<span class="flex items-center gap-x-2">
					Σύνολο (€)
					<Show when={manual()}>
						<FeeManualMarker />
					</Show>
				</span>
				<input
					type="number"
					min="0"
					step="1"
					inputmode="numeric"
					class={cellInput}
					value={total()}
					onInput={(e) => {
						setTouched(true);
						setTotal(Number(e.currentTarget.value) || 0);
					}}
				/>
			</label>
			<Show when={pinned}>
				<button
					type="button"
					class={smallButton}
					disabled={!manual() || props.catalogTotal === null}
					onClick={() => {
						setTouched(true);
						if (props.catalogTotal !== null) setTotal(props.catalogTotal);
					}}>
					<Icon name="undo" class="mr-1" />
					Επαναφορά τιμής καταλόγου
					<Show when={props.catalogTotal !== null}> ({euro(props.catalogTotal!)})</Show>
				</button>
			</Show>
			<label class="grid gap-y-1 text-sm">
				<span>Ποσό που καταβλήθηκε (€)</span>
				<input
					type="number"
					min="0"
					step="1"
					inputmode="numeric"
					class={cellInput}
					value={paid()}
					onInput={(e) => setPaid(Number(e.currentTarget.value) || 0)}
				/>
			</label>
			<label class="grid gap-y-1 text-sm">
				<span>Ημερομηνία πληρωμής</span>
				<input type="date" class={cellInput + " w-40"} value={date()} onInput={(e) => setDate(e.currentTarget.value)} />
			</label>
			<p class="text-sm" id={`${uid}-balance`} aria-live="polite">
				Υπόλοιπο: <span class="font-semibold tabular-nums">{euro(Math.max(total() - paid(), 0))}</span>
			</p>
			<div class="flex gap-2">
				<button
					type="submit"
					disabled={props.busy}
					class="rounded-md bg-green-600 px-3 py-1 text-base text-white transition-colors hover:bg-green-700 disabled:opacity-40 dark:bg-green-600 dark:hover:bg-green-500">
					Αποθήκευση
				</button>
				<button type="button" class={smallButton} onClick={props.onCancel}>
					Άκυρο
				</button>
			</div>
		</form>
	);
}
