import { EVALUATION_BADGE, EVALUATION_LABEL, placementClassYearsForClassId } from "@lib/classYears";
import { type APIResponse } from "@routes/index.client";
import type { ExtendedFormData } from "@utilities/forms";
import { Index, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";

/*
 * Enrollment form pieces for the fees (docs/FEES.md §3, §5), rendered inside the generic `Modal` through an
 * `Input` of type "custom". Shared by the registrations table and the Μαθητολόγιο.
 *
 * - `EnrollmentPlacementFields` (edit / add modal): the «Υπό Κατάταξη» checkbox and the placement class-year
 *   select. Read back with `readPlacementFields`.
 * - Fees / payment helpers shared with the «Δίδακτρα μαθητή» dialog (PupilFeesDialog.solid.tsx):
 *   `paymentUpdateBody`, `confirmSettle`, the date-input converters, `discountLabel`, `euro`.
 */

export type PreviewRow = APIResponse["Pupils.previewFees"]["rows"][number];

export const euro = (value: number) => `${value} €`;

/** «-50% (2η εγγραφή)» for a discounted position, '—' for the first enrollment. */
export const discountLabel = (row: Pick<PreviewRow, "factor" | "position">) => {
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
// Fees / payment helpers (the «Δίδακτρα μαθητή» dialog)
// ---------------------------------------------------------------------------

/** The stored enrollment a payment save edits (pupil and enrollment fields of a joined / history row). */
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

const pad = (n: number) => String(n).padStart(2, "0");
/** Timestamp → the `yyyy-mm-dd` value of a date input (local day). */
export const toDateValue = (value: number | null | undefined) => {
	if (!value) return "";
	const d = new Date(value);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** `yyyy-mm-dd` → local-midnight timestamp (the same day the admin date pickers store), null when empty. */
export const fromDateValue = (value: string) => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime() : null;
};

/** Today's local-midnight timestamp (the payment date «Εξόφληση» records). */
export const todayTimestamp = () => fromDateValue(toDateValue(Date.now()))!;

/** «Εξόφληση» of one enrollment: asks only when it would overwrite a different, non-zero paid amount. */
export const confirmSettle = (paid: number, total: number) =>
	!(paid > 0 && paid !== total) || window.confirm(`Το καταβληθέν ποσό (${euro(paid)}) θα αντικατασταθεί με ${euro(total)}. Συνέχεια;`);

/** A stored enrollment as `Pupils.updateEnrollment` needs it (joined or history row). */
export type StoredEnrollment = PaymentEnrollment & { teacher_id: number; instrument_id: number; date: number; pass: boolean };

/**
 * `Pupils.updateEnrollment` body of a fees / payment save: the registration details resent exactly as stored,
 * with the new total («Ειδική τιμή») and payment.
 */
export const paymentUpdateBody = (
	enrollment: StoredEnrollment,
	payment: { total_payment: number; fee_manual?: boolean; payment_amount: number; payment_date: number | null },
) => ({
	id: enrollment.id,
	pupil_id: enrollment.pupil_id,
	registration_year: enrollment.registration_year,
	class_id: enrollment.class_id as 0 | 1 | 2,
	class_year: enrollment.class_year,
	evaluation: enrollment.evaluation,
	teacher_id: enrollment.teacher_id,
	instrument_id: enrollment.instrument_id,
	date: enrollment.date,
	pass: enrollment.pass,
	total_payment: payment.total_payment,
	fee_manual: payment.fee_manual,
	payment_amount: payment.payment_amount,
	payment_date: payment.payment_date,
});
