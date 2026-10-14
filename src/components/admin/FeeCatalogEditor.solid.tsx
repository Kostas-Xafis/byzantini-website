import type { Teachers } from "@_types/entities";
import { TRADITIONAL_FEE_CLASS_YEARS, z_FeeCatalogData, type FeeCatalog, type FeeCatalogData } from "@lib/fees";
import { apiCall } from "@hooks/apiCall";
import { currentSchoolYear, currentSchoolYearStart, schoolYearOf } from "@lib/pupils/years";
import { API } from "@routes/index.client";
import { For, Show, createMemo, createSignal, createUniqueId, onMount } from "solid-js";
import { toast } from "./toast";

/** FEES.md §2 seed values — the template of last resort. */
const SEED: FeeCatalogData = {
	evaluation_fee: 100,
	byzantine: { default: 20, teachers: {} },
	traditional: Object.fromEntries(
		TRADITIONAL_FEE_CLASS_YEARS.map((year) => [year, ["Α' Ανωτέρα", "Β' Ανωτέρα", "Α' Διπλώματος", "Β' Διπλώματος"].includes(year) ? 100 : 50]),
	),
	european: { default: 50 },
	multi_enrollment_factor: 0.5,
};

type TeacherRow = { key: string; id: string; price: string };
type FormState = {
	evaluation_fee: string;
	byzDefault: string;
	teachers: TeacherRow[];
	traditional: Record<string, string>;
	european: string;
	/** Multi-enrollment discount in percent (factor 0.5 ⇒ "50"). */
	discount: string;
};

const euro = (value: number) => `${value} €`;
const percentOfFactor = (factor: number) => String(Math.round((1 - factor) * 10000) / 100);
const factorOfPercent = (percent: number) => Math.round((1 - percent / 100) * 10000) / 10000;
const formatDate = (ms: number) => {
	// Rows store milliseconds; tolerate seconds.
	const date = new Date(ms < 1e11 ? ms * 1000 : ms);
	return date.toLocaleString("el-GR", { dateStyle: "medium", timeStyle: "short" });
};

const toForm = (data: FeeCatalogData): FormState => ({
	evaluation_fee: String(data.evaluation_fee),
	byzDefault: String(data.byzantine.default),
	teachers: Object.entries(data.byzantine.teachers).map(([id, price]) => ({ key: createUniqueId(), id, price: String(price) })),
	traditional: Object.fromEntries(
		TRADITIONAL_FEE_CLASS_YEARS.map((year) => [year, data.traditional[year] === undefined ? "" : String(data.traditional[year])]),
	),
	european: String(data.european.default),
	discount: percentOfFactor(data.multi_enrollment_factor),
});

/** Strict whole-number parse: "" and "12.5" become NaN so that zod reports them. */
const num = (value: string) => (/^\s*\d+\s*$/.test(value) ? Number(value) : NaN);

function toData(form: FormState): FeeCatalogData {
	const percent = form.discount.trim() === "" ? NaN : Number(form.discount.replace(",", "."));
	return {
		evaluation_fee: num(form.evaluation_fee),
		byzantine: {
			default: num(form.byzDefault),
			teachers: Object.fromEntries(form.teachers.filter((row) => row.id !== "").map((row) => [row.id, num(row.price)])),
		},
		traditional: Object.fromEntries(Object.entries(form.traditional).map(([year, value]) => [year, num(value)])),
		european: { default: num(form.european) },
		multi_enrollment_factor: factorOfPercent(percent),
	};
}

/** Field errors keyed by dot path (`byzantine.teachers.12`, `traditional.Α' Κατωτέρα`, ...). */
function validate(form: FormState): { data: FeeCatalogData; errors: Record<string, string> } {
	const data = toData(form);
	const errors: Record<string, string> = {};
	const parsed = z_FeeCatalogData.safeParse(data);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			const key = issue.path.join(".");
			errors[key] ??= issue.message;
		}
	}
	const seen = new Set<string>();
	for (const row of form.teachers) {
		if (row.id === "") errors[`row.${row.key}`] = "Επιλέξτε καθηγητή";
		else if (seen.has(row.id)) errors[`row.${row.key}`] = "Ο καθηγητής υπάρχει ήδη στη λίστα";
		seen.add(row.id);
	}
	const percent = Number(form.discount.replace(",", "."));
	if (form.discount.trim() === "" || Number.isNaN(percent) || percent < 0 || percent > 100)
		errors["multi_enrollment_factor"] = "Η έκπτωση πρέπει να είναι από 0% έως 100%";
	return { data, errors };
}

/** Human-readable differences (or, without `prev`, a summary of every value). */
function describe(prev: FeeCatalogData | null, next: FeeCatalogData, teacherName: (id: string) => string): string[] {
	const lines: string[] = [];
	const line = (label: string, before: number | undefined, after: number | undefined, fmt: (n: number) => string = euro) => {
		if (prev === null) {
			if (after !== undefined) lines.push(`${label}: ${fmt(after)}`);
		} else if (before !== after) {
			lines.push(`${label}: ${before === undefined ? "—" : fmt(before)} → ${after === undefined ? "αφαιρέθηκε" : fmt(after)}`);
		}
	};
	line("Τέλος κατάταξης", prev?.evaluation_fee, next.evaluation_fee);
	line("Βυζαντινή · Βασική τιμή", prev?.byzantine.default, next.byzantine.default);
	const ids = new Set([...Object.keys(prev?.byzantine.teachers ?? {}), ...Object.keys(next.byzantine.teachers)]);
	for (const id of ids) line(`Βυζαντινή · ${teacherName(id)}`, prev?.byzantine.teachers[id], next.byzantine.teachers[id]);
	for (const year of TRADITIONAL_FEE_CLASS_YEARS) line(`Παραδοσιακή · ${year}`, prev?.traditional[year], next.traditional[year]);
	line("Ευρωπαϊκή · Ενιαία τιμή", prev?.european.default, next.european.default);
	line("Έκπτωση πολλαπλών εγγραφών", prev?.multi_enrollment_factor, next.multi_enrollment_factor, (f) => `${percentOfFactor(f)}%`);
	return lines;
}

const inputClass =
	"w-full rounded-md border border-red-900/30 bg-white dark:bg-dark dark:text-red-50 px-2 py-1.5 text-right tabular-nums focus-visible:outline-2 focus-visible:outline-red-900 dark:focus-visible:outline-red-300 aria-[invalid=true]:border-red-600";
const buttonClass =
	"w-fit rounded-md px-4 py-2 font-bold bg-red-900 text-red-50 hover:bg-red-950 disabled:opacity-60 disabled:cursor-not-allowed transition-colors";
const ghostButtonClass =
	"w-fit rounded-md px-3 py-1.5 font-bold border border-red-900 text-red-900 hover:bg-red-100 dark:border-red-300 dark:text-red-100 dark:hover:bg-red-950 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

export default function FeeCatalogEditor() {
	const [years, setYears] = createSignal<string[]>([]);
	const [teachers, setTeachers] = createSignal<Teachers[]>([]);
	const [year, setYear] = createSignal(currentSchoolYear());
	const [loading, setLoading] = createSignal(true);
	const [loadError, setLoadError] = createSignal("");
	const [active, setActive] = createSignal<FeeCatalog | null>(null);
	const [versions, setVersions] = createSignal<FeeCatalog[]>([]);
	/** What the form was initialised from: the active version, or the template for a year with no catalog. */
	const [baseline, setBaseline] = createSignal<FeeCatalogData>(SEED);
	const [form, setForm] = createSignal<FormState>(toForm(SEED));
	const [showErrors, setShowErrors] = createSignal(false);
	const [confirming, setConfirming] = createSignal(false);
	const [saving, setSaving] = createSignal(false);
	let loadToken = 0;

	const yearOptions = createMemo(() => {
		const start = currentSchoolYearStart();
		return [...new Set([...years(), schoolYearOf(start), schoolYearOf(start + 1)])].sort().reverse();
	});
	const teacherName = (id: string) => teachers().find((t) => String(t.id) === id)?.fullname ?? `Καθηγητής #${id}`;
	const checked = createMemo(() => validate(form()));
	const errors = () => (showErrors() ? checked().errors : {});
	const baselineLines = createMemo(() => describe(baseline(), checked().data, teacherName));
	const changes = createMemo(() => (Number.isNaN(checked().data.multi_enrollment_factor) ? [] : baselineLines()));
	// A year without a catalog can always save its first version; otherwise something must differ.
	const canSave = () => !saving() && !loading() && (active() === null || JSON.stringify(checked().data) !== JSON.stringify(baseline()));

	const patch = (changesToForm: Partial<FormState>) => {
		setConfirming(false);
		setForm((f) => ({ ...f, ...changesToForm }));
	};

	async function loadYear(schoolYear: string) {
		const token = ++loadToken;
		setLoading(true);
		setLoadError("");
		setConfirming(false);
		setShowErrors(false);
		try {
			const [activeRes, versionsRes] = await Promise.all([
				apiCall(API.FeeCatalog.getActive, { UrlArgs: { school_year: schoolYear } }),
				apiCall(API.FeeCatalog.getVersions, { UrlArgs: { school_year: schoolYear } }),
			]);
			if (token !== loadToken) return;
			const current = "data" in activeRes ? activeRes.data : null;
			let template: FeeCatalogData = current?.data ?? SEED;
			if (!current) {
				// Template: the latest catalog of any year.
				const latestYear = years()[0];
				if (latestYear) {
					const latestRes = await apiCall(API.FeeCatalog.getActive, { UrlArgs: { school_year: latestYear } });
					if (token !== loadToken) return;
					if ("data" in latestRes && latestRes.data) template = latestRes.data.data;
				}
			}
			setActive(current);
			setVersions("data" in versionsRes ? versionsRes.data : []);
			setBaseline(template);
			setForm(toForm(template));
		} catch (error) {
			if (token !== loadToken) return;
			console.error(error);
			setLoadError("Αδυναμία φόρτωσης του καταλόγου διδάκτρων.");
		} finally {
			if (token === loadToken) setLoading(false);
		}
	}

	onMount(async () => {
		try {
			const [yearsRes, teachersRes] = await Promise.all([apiCall(API.FeeCatalog.getYears), apiCall(API.Teachers.getByFullnames)]);
			if ("data" in yearsRes) setYears(yearsRes.data);
			if ("data" in teachersRes) setTeachers(teachersRes.data);
		} catch (error) {
			console.error(error);
		}
		await loadYear(year());
	});

	const onYearChange = (next: string) => {
		if (next === year()) return;
		if (JSON.stringify(checked().data) !== JSON.stringify(baseline()) && !window.confirm("Οι αλλαγές που δεν έχουν αποθηκευτεί θα χαθούν. Συνέχεια;")) {
			// Re-sync the select with the unchanged year.
			setYear(year());
			return;
		}
		setYear(next);
		void loadYear(next);
	};

	const onSaveClick = () => {
		setShowErrors(true);
		if (Object.keys(checked().errors).length > 0) {
			toast.error("Διορθώστε τα πεδία που σημειώνονται με κόκκινο.", { title: "Μη έγκυρος κατάλογος" });
			return;
		}
		setConfirming(true);
	};

	const onConfirm = async () => {
		const schoolYear = year();
		setSaving(true);
		try {
			const res = await toast.promise(apiCall(API.FeeCatalog.create, { RequestObject: { school_year: schoolYear, data: checked().data } }), {
				title: "Κατάλογος διδάκτρων",
				loading: "Αποθήκευση νέας έκδοσης…",
				success: `Η νέα έκδοση του καταλόγου ${schoolYear} αποθηκεύτηκε.`,
				error: (error: unknown) => (error instanceof Error && error.message ? error.message : "Αποτυχία αποθήκευσης της νέας έκδοσης."),
			});
			if (!("data" in res)) return;
			setConfirming(false);
			if (!years().includes(schoolYear)) setYears((list) => [...list, schoolYear].sort().reverse());
			await loadYear(schoolYear);
		} catch (error) {
			console.error(error);
		} finally {
			setSaving(false);
		}
	};

	const numberField = (id: string, label: string, value: () => string, set: (v: string) => void, errorKey: string, suffix = "€") => (
		<div class="grid gap-1">
			<label for={id} class="text-sm font-bold">
				{label}
			</label>
			<div class="flex items-center gap-2">
				<input
					id={id}
					type="text"
					inputmode="numeric"
					autocomplete="off"
					class={inputClass}
					value={value()}
					aria-invalid={errors()[errorKey] ? "true" : "false"}
					aria-describedby={errors()[errorKey] ? `${id}-err` : undefined}
					onInput={(e) => set(e.currentTarget.value)}
				/>
				<span aria-hidden="true">{suffix}</span>
			</div>
			<Show when={errors()[errorKey]}>
				<p id={`${id}-err`} class="text-xs text-red-700 dark:text-red-300">
					{errors()[errorKey]}
				</p>
			</Show>
		</div>
	);

	const fieldset = "grid gap-3 rounded-lg border border-red-900/20 p-4 min-w-0";
	const legend = "px-2 font-bold";
	const uid = createUniqueId();

	return (
		<section
			class="rounded-xl border border-red-900/20 bg-white dark:bg-dark p-5 shadow-md shadow-gray-300 dark:shadow-gray-700 grid gap-4"
			aria-labelledby="fee-catalog-title">
			<div class="grid gap-1">
				<h2 id="fee-catalog-title" class="font-anaktoria text-2xl">
					Κατάλογος διδάκτρων
				</h2>
				<p class="text-sm dark:text-gray-300">Οι τιμές διδάκτρων ανά σχολικό έτος. Κάθε αποθήκευση δημιουργεί νέα έκδοση του καταλόγου.</p>
			</div>

			<div class="grid gap-1 sm:max-w-xs">
				<label for={`${uid}-year`} class="text-sm font-bold">
					Σχολικό έτος
				</label>
				<select
					id={`${uid}-year`}
					class={`${inputClass} text-left`}
					value={year()}
					disabled={saving()}
					onChange={(e) => {
						onYearChange(e.currentTarget.value);
						e.currentTarget.value = year();
					}}>
					<For each={yearOptions()}>
						{(option) => (
							<option value={option} selected={option === year()}>
								{option}
								{years().includes(option) ? "" : " (χωρίς κατάλογο)"}
							</option>
						)}
					</For>
				</select>
			</div>

			<Show when={loadError()}>
				<p role="alert" class="text-sm text-red-700 dark:text-red-300">
					{loadError()}{" "}
					<button type="button" class="underline" onClick={() => loadYear(year())}>
						Δοκιμή ξανά
					</button>
				</p>
			</Show>
			<Show when={loading()}>
				<p class="text-sm dark:text-gray-300" role="status">
					Φόρτωση…
				</p>
			</Show>

			<Show when={!loading() && !loadError()}>
				<Show
					when={active()}
					fallback={
						<p class="text-sm rounded-md bg-red-50 dark:bg-gray-800 p-3">
							Το σχολικό έτος {year()} δεν έχει κατάλογο διδάκτρων. Η φόρμα ξεκινά από τις τιμές του πιο πρόσφατου καταλόγου — αποθηκεύστε για να
							δημιουργήσετε την πρώτη έκδοση.
						</p>
					}>
					{(current) => (
						<p class="text-xs text-gray-600 dark:text-gray-300">
							Ενεργή έκδοση #{current().id} · {formatDate(current().created_at)}
							{current().created_by ? ` · ${current().created_by}` : ""}
						</p>
					)}
				</Show>

				<form
					class="grid gap-4"
					novalidate
					onSubmit={(e) => {
						e.preventDefault();
						onSaveClick();
					}}>
					<fieldset class={fieldset}>
						<legend class={legend}>Τέλος κατάταξης</legend>
						<div class="sm:max-w-xs">
							{numberField(
								`${uid}-eval`,
								"Τέλος κατάταξης",
								() => form().evaluation_fee,
								(v) => patch({ evaluation_fee: v }),
								"evaluation_fee",
							)}
						</div>
						<p class="text-xs text-gray-600 dark:text-gray-300">Σταθερό ποσό ανά εγγραφή με κατάταξη, χωρίς έκπτωση.</p>
					</fieldset>

					<fieldset class={fieldset}>
						<legend class={legend}>Βυζαντινή</legend>
						<div class="sm:max-w-xs">
							{numberField(
								`${uid}-byz`,
								"Βασική τιμή",
								() => form().byzDefault,
								(v) => patch({ byzDefault: v }),
								"byzantine.default",
							)}
						</div>
						<div role="group" aria-labelledby={`${uid}-teachers`} class="grid gap-2">
							<p id={`${uid}-teachers`} class="text-sm font-bold">
								Μη συνεργαζόμενοι καθηγητές
							</p>
							<Show when={form().teachers.length === 0}>
								<p class="text-xs text-gray-600 dark:text-gray-300">Κανένας καθηγητής με ειδική τιμή.</p>
							</Show>
							<For each={form().teachers}>
								{(row, index) => {
									const rowErr = () => errors()[`row.${row.key}`] ?? errors()[`byzantine.teachers.${row.id}`];
									return (
										<div class="grid gap-1">
											<div class="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
												<div class="grid gap-1 min-w-0">
													<label for={`${uid}-t-${row.key}`} class="text-xs">
														Καθηγητής {index() + 1}
													</label>
													<select
														id={`${uid}-t-${row.key}`}
														class={`${inputClass} text-left`}
														aria-invalid={rowErr() ? "true" : "false"}
														onChange={(e) =>
															patch({
																teachers: form().teachers.map((r) =>
																	r.key === row.key ? { ...r, id: e.currentTarget.value } : r,
																),
															})
														}>
														<option value="" selected={row.id === ""}>
															— Επιλογή —
														</option>
														<For each={teachers()}>
															{(t) => (
																<option value={String(t.id)} selected={String(t.id) === row.id}>
																	{t.fullname}
																</option>
															)}
														</For>
													</select>
												</div>
												<div class="grid gap-1">
													<label for={`${uid}-p-${row.key}`} class="text-xs">
														Τιμή (€)
													</label>
													<input
														id={`${uid}-p-${row.key}`}
														type="text"
														inputmode="numeric"
														autocomplete="off"
														class={inputClass}
														value={row.price}
														aria-invalid={rowErr() ? "true" : "false"}
														onInput={(e) =>
															patch({
																teachers: form().teachers.map((r) =>
																	r.key === row.key ? { ...r, price: e.currentTarget.value } : r,
																),
															})
														}
													/>
												</div>
												<button
													type="button"
													class={ghostButtonClass}
													aria-label={`Αφαίρεση καθηγητή ${index() + 1}${row.id ? `: ${teacherName(row.id)}` : ""}`}
													onClick={() => patch({ teachers: form().teachers.filter((r) => r.key !== row.key) })}>
													<i class="fa-solid fa-trash" aria-hidden="true"></i>
												</button>
											</div>
											<Show when={rowErr()}>
												<p class="text-xs text-red-700 dark:text-red-300">{rowErr()}</p>
											</Show>
										</div>
									);
								}}
							</For>
							<button
								type="button"
								class={ghostButtonClass}
								onClick={() => patch({ teachers: [...form().teachers, { key: createUniqueId(), id: "", price: form().byzDefault }] })}>
								<i class="fa-solid fa-plus mr-2" aria-hidden="true"></i>
								Προσθήκη καθηγητή
							</button>
						</div>
					</fieldset>

					<fieldset class={fieldset}>
						<legend class={legend}>Παραδοσιακή</legend>
						<div class="grid gap-3 sm:grid-cols-2">
							<For each={[...TRADITIONAL_FEE_CLASS_YEARS]}>
								{(classYear, i) =>
									numberField(
										`${uid}-tr-${i()}`,
										classYear,
										() => form().traditional[classYear] ?? "",
										(v) => patch({ traditional: { ...form().traditional, [classYear]: v } }),
										`traditional.${classYear}`,
									)
								}
							</For>
						</div>
					</fieldset>

					<fieldset class={fieldset}>
						<legend class={legend}>Ευρωπαϊκή</legend>
						<div class="sm:max-w-xs">
							{numberField(
								`${uid}-eu`,
								"Ενιαία τιμή",
								() => form().european,
								(v) => patch({ european: v }),
								"european.default",
							)}
						</div>
					</fieldset>

					<fieldset class={fieldset}>
						<legend class={legend}>Πολλαπλές εγγραφές</legend>
						<div class="sm:max-w-xs">
							{numberField(
								`${uid}-disc`,
								"Έκπτωση πολλαπλών εγγραφών",
								() => form().discount,
								(v) => patch({ discount: v }),
								"multi_enrollment_factor",
								"%",
							)}
						</div>
						<p class="text-xs text-gray-600 dark:text-gray-300">Ισχύει για κάθε εγγραφή του μαθητή μετά την πρώτη του ίδιου σχολικού έτους.</p>
					</fieldset>

					<Show when={confirming()}>
						<div role="alertdialog" aria-labelledby={`${uid}-confirm`} class="grid gap-3 rounded-lg border-2 border-red-900 p-4">
							<p id={`${uid}-confirm`} class="font-bold">
								Αποθήκευση νέας έκδοσης για το {year()};
							</p>
							<Show when={changes().length > 0} fallback={<p class="text-sm">Δεν υπάρχουν αλλαγές σε σχέση με τις προτεινόμενες τιμές.</p>}>
								<ul class="list-disc pl-5 text-sm grid gap-0.5">
									<For each={changes()}>{(line) => <li>{line}</li>}</For>
								</ul>
							</Show>
							<div class="flex flex-wrap gap-2">
								<button type="button" class={buttonClass} disabled={saving()} onClick={onConfirm}>
									{saving() ? "Αποθήκευση…" : "Επιβεβαίωση"}
								</button>
								<button type="button" class={ghostButtonClass} disabled={saving()} onClick={() => setConfirming(false)}>
									Άκυρο
								</button>
							</div>
						</div>
					</Show>

					<div class="grid gap-2">
						<button type="submit" class={buttonClass} disabled={!canSave() || confirming()}>
							Αποθήκευση νέας έκδοσης
						</button>
						<p class="text-xs text-gray-600 dark:text-gray-300">
							Η νέα έκδοση ισχύει μόνο για τις ΝΕΕΣ εγγραφές. Οι υπάρχουσες εγγραφές διατηρούν τις τιμές της έκδοσης με την οποία καταχωρήθηκαν.
						</p>
					</div>
				</form>

				<div class="grid gap-2">
					<h3 class="font-bold">Ιστορικό εκδόσεων</h3>
					<Show when={versions().length > 0} fallback={<p class="text-sm dark:text-gray-300">Δεν υπάρχουν εκδόσεις για το {year()}.</p>}>
						<ul class="grid gap-2">
							<For each={versions()}>
								{(version, i) => {
									const lines = () => describe(versions()[i() + 1]?.data ?? null, version.data, teacherName);
									return (
										<li>
											<details class="rounded-md border border-red-900/20 p-2">
												<summary class="cursor-pointer text-sm">
													<span class="font-bold">#{version.id}</span> · {formatDate(version.created_at)} ·{" "}
													{version.created_by ?? "άγνωστος"}
													{i() === 0 ? " · ενεργή" : ""}
												</summary>
												<p class="mt-2 text-xs text-gray-600 dark:text-gray-300">
													{versions()[i() + 1]
														? `Αλλαγές σε σχέση με την έκδοση #${versions()[i() + 1].id}`
														: "Αρχική έκδοση — τιμές"}
												</p>
												<ul class="mt-1 list-disc pl-5 text-sm grid gap-0.5">
													<For each={lines()} fallback={<li>Καμία αλλαγή.</li>}>
														{(line) => <li>{line}</li>}
													</For>
												</ul>
											</details>
										</li>
									);
								}}
							</For>
						</ul>
					</Show>
				</div>
			</Show>
		</section>
	);
}
