import { apiCall } from "@hooks/apiCall";
import { classYearLabel, EVALUATION_BADGE, EVALUATION_LABEL, placementClassYearsForClassId } from "@lib/classYears";
import { API, type APIResponse } from "@routes/index.client";
import type { ExtendedFormData } from "@utilities/forms";
import { Index, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";

/*
 * Enrollment form pieces for the fees (docs/FEES.md §3, §5), rendered inside the generic `Modal` through an
 * `Input` of type "custom". Shared by the registrations table and the Μαθητολόγιο.
 *
 * - `EnrollmentPlacementFields` (edit / add modal): the «Υπό Κατάταξη» checkbox and the placement class-year
 *   select. Read back with `readPlacementFields`.
 * - `EnrollmentPaymentFields` («Δίδακτρα & Πληρωμή» modal): a read-only summary of the registration, the live
 *   fee breakdown from `Pupils.previewFees`, the editable total («Ειδική τιμή» / «Επαναφορά τιμής καταλόγου»),
 *   the payment fields with the remaining balance, and «Εξόφληση». Read back with `readPaymentFields`.
 */

type PreviewRow = APIResponse["Pupils.previewFees"]["rows"][number];

const euro = (value: number) => `${value} €`;

/** «-50% (2η εγγραφή)» for a discounted position, '—' for the first enrollment. */
const discountLabel = (row: PreviewRow) => {
	if (row.factor === null || row.factor >= 1) return "—";
	return `-${Math.round((1 - row.factor) * 100)}% (${row.position + 1}η εγγραφή)`;
};

/** The «Ειδική τιμή» marker: icon + visible text (or a title + screen-reader text in compact mode). */
export function FeeManualMarker(props: { compact?: boolean }) {
	return (
		<span
			title="Ειδική τιμή: ορίστηκε χειροκίνητα, δεν επανυπολογίζεται"
			class="inline-flex items-center gap-x-1 whitespace-nowrap rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900 dark:bg-sky-900/50 dark:text-sky-100">
			<i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i>
			{props.compact ? <span class="sr-only">Ειδική τιμή</span> : "Ειδική τιμή"}
		</span>
	);
}

/** The «Κατάταξη» badge of a placed enrollment that went through the evaluation exam. */
export function EvaluationBadge() {
	return (
		<span
			title="Εγγράφηκε με κατατακτήριες εξετάσεις"
			class="ml-1 inline-block whitespace-nowrap rounded-full bg-violet-100 px-2 py-0.5 align-middle text-xs font-semibold text-violet-900 dark:bg-violet-900/50 dark:text-violet-100">
			{EVALUATION_BADGE}
		</span>
	);
}

const inputClass =
	"w-full rounded-md border-2 border-gray-800 bg-white px-3 py-2 font-didact text-lg text-red-950 shadow-md shadow-gray-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900 dark:border-gray-500 dark:bg-dark dark:text-red-50 dark:shadow-gray-700 dark:focus-visible:outline-red-300";

const fieldsetClass = "col-span-full grid gap-4 rounded-lg border-2 border-red-900/30 p-4 font-didact text-red-950 dark:border-red-800/60 dark:text-red-50";

let uidSeq = 0;
const nextUid = (prefix: string) => `${prefix}-${++uidSeq}`;

// ---------------------------------------------------------------------------
// Placement: «Υπό Κατάταξη» + class year
// ---------------------------------------------------------------------------

export type EnrollmentPlacementFieldsProps = {
	classId: number;
	classYear: string;
	evaluation: boolean;
};

/** Reads (and validates) the placement fields: a class year is required unless the enrollment awaits placement. */
export function readPlacementFields(form: ExtendedFormData<any>) {
	const evaluation = form.get("evaluation") === "true";
	const rawYear = form.string("class_year", "");
	const class_year = rawYear === "undefined" ? "" : rawYear;
	if (!class_year && !evaluation) throw new Error("Επιλέξτε έτος φοίτησης ή σημειώστε «Υπό Κατάταξη»");
	return { evaluation, class_year };
}

/** The «Υπό Κατάταξη» checkbox and the class-year select; the year list follows the form's `class_id` select. */
export function EnrollmentPlacementFields(props: EnrollmentPlacementFieldsProps) {
	let root!: HTMLFieldSetElement;
	const uid = nextUid("placement");
	const [evaluation, setEvaluation] = createSignal(props.evaluation);
	const [classYear, setClassYear] = createSignal(props.classYear);
	const [classId, setClassId] = createSignal(props.classId);

	const classYears = createMemo(() => {
		const list = [...placementClassYearsForClassId(classId())];
		// A legacy / custom value stays selectable so saving the form does not lose it.
		if (props.classYear && classId() === props.classId && !list.includes(props.classYear)) list.push(props.classYear);
		return list;
	});

	onMount(() => {
		const form = root.closest("form");
		if (!form) return;
		const read = () => {
			const select = form.querySelector("[name='class_id']") as HTMLSelectElement | null;
			const next = Number(select?.value);
			if (Number.isInteger(next) && next >= 0 && next <= 2) setClassId(next);
		};
		read();
		const onChange = (e: Event) => {
			if (!root.contains(e.target as Node)) read();
		};
		form.addEventListener("change", onChange);
		onCleanup(() => form.removeEventListener("change", onChange));
	});

	// A department switch keeps the class year only when the new department has it.
	createEffect(
		on(
			classId,
			() => {
				if (classYear() && !classYears().includes(classYear())) setClassYear("");
			},
			{ defer: true },
		),
	);

	return (
		<fieldset ref={root} class={fieldsetClass}>
			<legend class="px-2 text-xl">Κατάταξη</legend>
			<div class="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
				<label class="flex cursor-pointer items-center gap-x-3 self-center text-lg">
					<input
						type="checkbox"
						name="evaluation"
						value="true"
						checked={evaluation()}
						onChange={(e) => setEvaluation(e.currentTarget.checked)}
						class="size-5 cursor-pointer accent-red-900 dark:accent-red-500"
					/>
					{EVALUATION_LABEL}
				</label>
				<label class="grid gap-y-1 text-base">
					<span>Έτος Φοίτησης</span>
					<select
						name="class_year"
						class={inputClass}
						aria-invalid={!classYear() && !evaluation() ? "true" : undefined}
						aria-describedby={`${uid}-hint`}
						onChange={(e) => setClassYear(e.currentTarget.value)}>
						<option value="" selected={!classYear()}>
							{evaluation() ? "— εκκρεμεί κατάταξη —" : "— επιλέξτε —"}
						</option>
						<Index each={classYears()}>
							{(year) => (
								<option value={year()} selected={year() === classYear()}>
									{year()}
								</option>
							)}
						</Index>
					</select>
					<span id={`${uid}-hint`} class="text-sm text-gray-600 dark:text-gray-300">
						<Show when={!classYear()} fallback={evaluation() ? `Τοποθετήθηκε μετά από κατάταξη (${EVALUATION_BADGE})` : ""}>
							{evaluation() ? "Αναμένει κατάταξη — επιλέξτε έτος για να τοποθετηθεί" : "Απαιτείται έτος φοίτησης"}
						</Show>
					</span>
				</label>
			</div>
		</fieldset>
	);
}

// ---------------------------------------------------------------------------
// «Δίδακτρα & Πληρωμή»
// ---------------------------------------------------------------------------

/** The stored enrollment the payment modal edits (pupil and enrollment fields of a joined / history row). */
export type PaymentEnrollment = {
	id: number;
	pupil_id: number;
	registration_year: string;
	class_id: number;
	class_year: string;
	evaluation: boolean;
	fee_catalog_id: number | null;
	fee_manual: boolean;
	total_payment: number;
	payment_amount: number;
	payment_date?: number | null;
};

export type EnrollmentPaymentFieldsProps = {
	enrollment: PaymentEnrollment;
	summary: { name: string; am: string; teacher: string };
};

const DEPARTMENTS = ["Βυζαντινή Μουσική", "Παραδοσιακή Μουσική", "Ευρωπαϊκή Μουσική"];

const pad = (n: number) => String(n).padStart(2, "0");
/** Timestamp → the `yyyy-mm-dd` value of a date input (local day). */
const toDateValue = (value: number | null | undefined) => {
	if (!value) return "";
	const d = new Date(value);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** `yyyy-mm-dd` → local-midnight timestamp (the same day the admin date pickers store), null when empty. */
const fromDateValue = (value: string) => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime() : null;
};

/** Reads the payment modal's fields. `settle` is true when the save came from «Εξόφληση». */
export function readPaymentFields(form: ExtendedFormData<any>) {
	const feeManual = form.string("fee_manual", "");
	const total_payment = form.number("total_payment", 0);
	const payment_amount = form.number("payment_amount", 0);
	if (total_payment < 0 || payment_amount < 0 || !Number.isInteger(total_payment) || !Number.isInteger(payment_amount)) {
		throw new Error("Τα ποσά πρέπει να είναι ακέραιοι θετικοί αριθμοί");
	}
	return {
		total_payment,
		payment_amount,
		payment_date: fromDateValue(form.string("payment_date", "")),
		/** undefined (omitted from the JSON body) on enrollments without a pinned catalog. */
		fee_manual: feeManual === "" ? undefined : feeManual === "true",
		settle: form.get("settle") === "true",
	};
}

export function EnrollmentPaymentFields(props: EnrollmentPaymentFieldsProps) {
	const enrollment = props.enrollment;
	const uid = nextUid("payment");
	let totalInput!: HTMLInputElement;
	let paidInput!: HTMLInputElement;
	let dateInput!: HTMLInputElement;
	let settleInput!: HTMLInputElement;
	let root!: HTMLDivElement;

	const [total, setTotal] = createSignal(enrollment.total_payment);
	const [paid, setPaid] = createSignal(enrollment.payment_amount || 0);
	// Once the total is typed in (or reset), «Ειδική τιμή» follows the comparison with the catalog price.
	const [touched, setTouched] = createSignal(false);

	const [row, setRow] = createSignal<PreviewRow | null>(null);
	const [loading, setLoading] = createSignal(true);
	const [previewError, setPreviewError] = createSignal<string | null>(null);

	const pinned = createMemo(() => (row() ? row()!.fee_catalog_id !== null : enrollment.fee_catalog_id !== null));
	const catalogTotal = () => row()?.catalog_total ?? null;
	const manual = createMemo(() => {
		if (!pinned()) return false;
		if (!touched()) return enrollment.fee_manual;
		const computed = catalogTotal();
		return computed === null ? enrollment.fee_manual : total() !== computed;
	});
	const balance = () => total() - paid();
	const fullyPaid = () => total() <= 0 || paid() >= total();

	// A non-manual total follows the catalog price.
	createEffect(
		on(catalogTotal, (computed) => {
			if (computed !== null && !manual()) setTotal(computed);
		}),
	);

	// The stored pupil-year as it is — the registration details are not edited here.
	onMount(async () => {
		try {
			const res = await apiCall(API.Pupils.previewFees, {
				RequestObject: { pupil_id: enrollment.pupil_id, registration_year: enrollment.registration_year },
			});
			if ("data" in res) setRow(res.data.rows.find((r) => r.id === enrollment.id) ?? null);
		} catch (error) {
			setPreviewError(error instanceof Error ? error.message : "Σφάλμα κατά τον υπολογισμό των διδάκτρων");
		} finally {
			setLoading(false);
		}
	});

	const resetToCatalog = () => {
		const computed = catalogTotal();
		setTouched(true);
		if (computed !== null) setTotal(computed);
	};

	/** «Εξόφληση»: paid = total, date = today, then save the form in one click. */
	const settle = () => {
		const amount = total();
		if (paid() > 0 && paid() !== amount && !window.confirm(`Το καταβληθέν ποσό (${euro(paid())}) θα αντικατασταθεί με ${euro(amount)}. Συνέχεια;`)) return;
		const today = toDateValue(Date.now());
		setPaid(amount);
		paidInput.value = String(amount);
		dateInput.value = today;
		settleInput.value = "true";
		const form = root.closest("form");
		if (!form) return;
		// Reset the flag if the submit fails, so a later plain save is not reported as «Εξόφληση».
		setTimeout(() => (settleInput.value = ""), 0);
		form.requestSubmit();
	};

	const summaryYear = () => classYearLabel(enrollment.class_year, enrollment.evaluation) || "-";

	return (
		<div ref={root} class="col-span-full grid gap-4 font-didact text-red-950 dark:text-red-50">
			{/* registration summary (read-only) */}
			<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 rounded-lg bg-red-50 px-4 py-3 text-base dark:bg-red-900/25 [&_dt]:text-gray-600 dark:[&_dt]:text-gray-300">
				<dt>Μαθητής</dt>
				<dd class="font-semibold">
					{props.summary.name} <span class="font-normal text-gray-600 dark:text-gray-300">(ΑΜ {props.summary.am || "—"})</span>
				</dd>
				<dt>Τμήμα</dt>
				<dd>{DEPARTMENTS[enrollment.class_id] ?? "-"}</dd>
				<dt>Έτος Φοίτησης</dt>
				<dd>
					{summaryYear()}
					<Show when={enrollment.evaluation && enrollment.class_year}>
						<EvaluationBadge />
					</Show>
				</dd>
				<dt>Καθηγητής</dt>
				<dd>{props.summary.teacher || "-"}</dd>
				<dt>Σχολικό Έτος</dt>
				<dd class="tabular-nums">{enrollment.registration_year}</dd>
			</dl>

			{/* fee breakdown */}
			<fieldset class={fieldsetClass}>
				<legend class="px-2 text-xl">Δίδακτρα</legend>
				<Show
					when={pinned()}
					fallback={
						<p class="text-sm text-gray-600 dark:text-gray-300" aria-live="polite">
							<Show
								when={previewError()}
								fallback={loading() ? "Υπολογισμός…" : "Χωρίς αυτόματα δίδακτρα για αυτό το σχολικό έτος — το σύνολο ορίζεται χειροκίνητα."}>
								{previewError()}
							</Show>
						</p>
					}>
					<dl
						class="grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-base [&_dd]:text-right [&_dd]:tabular-nums [&_dt]:text-gray-600 dark:[&_dt]:text-gray-300"
						aria-live="polite"
						aria-busy={loading() ? "true" : "false"}>
						<dt>Τιμή τμήματος</dt>
						<dd>{row() ? (row()!.fee_base === null ? "— (μετά την κατάταξη)" : euro(row()!.fee_base!)) : "…"}</dd>
						<dt>Έκπτωση</dt>
						<dd>{row() ? discountLabel(row()!) : "…"}</dd>
						<dt>Τέλος κατάταξης</dt>
						<dd>{row() ? (row()!.evaluation_fee > 0 ? euro(row()!.evaluation_fee) : "—") : "…"}</dd>
						<dt class="font-semibold text-red-950! dark:text-red-50!">Τιμή καταλόγου</dt>
						<dd class="font-semibold">{catalogTotal() !== null ? euro(catalogTotal()!) : "…"}</dd>
					</dl>
					<Show when={previewError()}>
						<p class="text-sm text-red-700 dark:text-red-300">{previewError()}</p>
					</Show>
				</Show>
				<div class="grid grid-cols-2 items-end gap-4 max-sm:grid-cols-1">
					<label class="grid gap-y-1 text-base">
						<span class="flex flex-wrap items-center gap-x-2">
							Σύνολο Πληρωμής (€)
							<Show when={manual()}>
								<FeeManualMarker />
							</Show>
						</span>
						<input
							ref={totalInput}
							type="number"
							name="total_payment"
							min="0"
							step="1"
							inputmode="numeric"
							class={inputClass}
							value={total()}
							onInput={(e) => {
								setTouched(true);
								setTotal(Number(e.currentTarget.value) || 0);
							}}
						/>
						<input type="hidden" name="fee_manual" value={pinned() ? String(manual()) : ""} />
					</label>
					<Show when={pinned()}>
						<div class="grid gap-y-1">
							<button
								type="button"
								disabled={!manual() || catalogTotal() === null}
								onClick={resetToCatalog}
								class="w-max rounded-md border border-red-900 px-3 py-1 text-sm transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:border-red-700 dark:hover:bg-red-900/35">
								<i class="fa-solid fa-rotate-left mr-2" aria-hidden="true"></i>
								Επαναφορά τιμής καταλόγου
							</button>
							<span class="text-sm text-gray-600 dark:text-gray-300">
								<Show when={manual()} fallback="Το σύνολο ακολουθεί τον κατάλογο.">
									Ειδική τιμή: δεν αλλάζει με τις εκπτώσεις ή τον κατάλογο.
								</Show>
							</span>
						</div>
					</Show>
				</div>
			</fieldset>

			{/* payment */}
			<fieldset class={fieldsetClass}>
				<legend class="px-2 text-xl">Πληρωμή</legend>
				<div class="grid grid-cols-3 items-end gap-4 max-sm:grid-cols-1">
					<label class="grid gap-y-1 text-base">
						<span>Ποσό που καταβλήθηκε (€)</span>
						<input
							ref={paidInput}
							type="number"
							name="payment_amount"
							min="0"
							step="1"
							inputmode="numeric"
							class={inputClass}
							value={paid()}
							onInput={(e) => setPaid(Number(e.currentTarget.value) || 0)}
						/>
					</label>
					<label class="grid gap-y-1 text-base">
						<span>Ημερομηνία Πληρωμής</span>
						<input ref={dateInput} type="date" name="payment_date" class={inputClass} value={toDateValue(enrollment.payment_date)} />
					</label>
					<div class="grid gap-y-1 text-base" aria-live="polite">
						<span id={`${uid}-balance`}>Υπόλοιπο</span>
						<span
							aria-labelledby={`${uid}-balance`}
							class={
								"px-1 py-2 text-2xl font-semibold tabular-nums " +
								(balance() > 0 ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300")
							}>
							{euro(Math.max(balance(), 0))}
							<Show when={balance() < 0}>
								<span class="ml-2 text-sm font-normal">(πλεόνασμα {euro(-balance())})</span>
							</Show>
						</span>
					</div>
				</div>
				<input ref={settleInput} type="hidden" name="settle" value="" />
				<div class="flex flex-wrap items-center gap-3">
					<button
						type="button"
						disabled={fullyPaid()}
						onClick={settle}
						class="rounded-md bg-emerald-700 px-4 py-2 text-lg text-white shadow-md transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500">
						<i class="fa-solid fa-check-double mr-2" aria-hidden="true"></i>
						Εξόφληση
					</button>
					<span class="text-sm text-gray-600 dark:text-gray-300">
						<Show when={!fullyPaid()} fallback={total() > 0 ? "Η εγγραφή είναι εξοφλημένη." : "Δεν υπάρχει ποσό προς εξόφληση."}>
							Καταχωρεί πληρωμή {euro(total())} με σημερινή ημερομηνία και αποθηκεύει.
						</Show>
					</span>
				</div>
			</fieldset>
		</div>
	);
}
