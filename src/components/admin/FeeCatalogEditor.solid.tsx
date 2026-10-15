import type { Teachers } from "@_types/entities";
import { apiCall } from "@hooks/apiCall";
import { placementClassYearsForClassId } from "@lib/classYears";
import {
	CLASS_BYZANTINE,
	CLASS_EUROPEAN,
	CLASS_TRADITIONAL,
	FEE_DEPARTMENT_ORDER,
	feeBase,
	feeRuleConflicts,
	feeRuleRank,
	z_FeeCatalogInput,
	type FeeCatalog,
	type FeeCatalogInput,
	type FeeRule,
} from "@lib/fees";
import { currentSchoolYear, currentSchoolYearStart, schoolYearOf } from "@lib/pupils/years";
import { API } from "@routes/index.client";
import { For, Show, createMemo, createSignal, createUniqueId, onMount } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { toast } from "./toast";

/** FEES.md §2 seed (teacher rules are omitted: their ids are only known to the database) — the template of last resort. */
const SEED: FeeCatalogInput = {
	evaluation_fee: 80,
	multi_enrollment_factor: 0.5,
	rules: [
		{ class_id: CLASS_BYZANTINE, class_years: null, teacher_id: null, price: 20 },
		{ class_id: CLASS_TRADITIONAL, class_years: placementClassYearsForClassId(CLASS_TRADITIONAL).slice(0, 6), teacher_id: null, price: 50 },
		{ class_id: CLASS_TRADITIONAL, class_years: placementClassYearsForClassId(CLASS_TRADITIONAL).slice(6), teacher_id: null, price: 100 },
		{ class_id: CLASS_EUROPEAN, class_years: null, teacher_id: null, price: 50 },
	],
};

const DEPARTMENTS: Record<number, string> = { [CLASS_BYZANTINE]: "Βυζαντινή", [CLASS_TRADITIONAL]: "Παραδοσιακή", [CLASS_EUROPEAN]: "Ευρωπαϊκή" };
const AWAITING = "Υπό Κατάταξη (πριν την κατάταξη)";

type YearMode = "all" | "range" | "set";
type RuleRow = {
	key: string;
	class_id: number;
	mode: YearMode;
	/** Range mode: first / last class year of the department's list. */
	from: string;
	to: string;
	/** Set mode: the chosen class years. */
	years: string[];
	/** Teacher id, "" = any teacher. */
	teacher: string;
	price: string;
};
type FormState = {
	evaluation_fee: string;
	/** Multi-enrollment discount in percent (factor 0.5 ⇒ "50"). */
	discount: string;
	rules: RuleRow[];
};

const euro = (value: number) => `${value} €`;
const percentOfFactor = (factor: number) => String(Math.round((1 - factor) * 10000) / 100);
const factorOfPercent = (percent: number) => Math.round((1 - percent / 100) * 10000) / 10000;
const formatDate = (ms: number) => new Date(ms < 1e11 ? ms * 1000 : ms).toLocaleString("el-GR", { dateStyle: "medium", timeStyle: "short" });

/** Strict whole-number parse: "" and "12.5" become NaN so that zod reports them. */
const num = (value: string) => (/^\s*\d+\s*$/.test(value) ? Number(value) : NaN);

function yearsLabel(classId: number, years: string[] | null): string {
	if (years === null) return "όλα τα έτη";
	const list = placementClassYearsForClassId(classId);
	const indexes = years.map((y) => list.indexOf(y));
	const contiguous = years.length > 1 && indexes.every((n, i) => n >= 0 && (i === 0 || n === indexes[i - 1] + 1));
	return contiguous ? `${years[0]} – ${years[years.length - 1]}` : years.join(", ");
}

const toRow = (rule: FeeRule): RuleRow => {
	const list = placementClassYearsForClassId(rule.class_id);
	const years = rule.class_years ?? [];
	const indexes = years.map((y) => list.indexOf(y));
	const contiguous = years.length > 1 && indexes.every((n, i) => n >= 0 && (i === 0 || n === indexes[i - 1] + 1));
	return {
		key: createUniqueId(),
		class_id: rule.class_id,
		mode: rule.class_years === null ? "all" : contiguous ? "range" : "set",
		from: contiguous ? years[0] : (list[0] ?? ""),
		to: contiguous ? years[years.length - 1] : (list[list.length - 1] ?? ""),
		years: [...years],
		teacher: rule.teacher_id === null ? "" : String(rule.teacher_id),
		price: String(rule.price),
	};
};

const toForm = (catalog: FeeCatalogInput): FormState => ({
	evaluation_fee: String(catalog.evaluation_fee),
	discount: percentOfFactor(catalog.multi_enrollment_factor),
	rules: catalog.rules.map(toRow),
});

/** The rule a row describes; `rangeError` flags an inverted range. */
function rowToRule(row: RuleRow): { rule: FeeRule; rangeError: boolean } {
	const list = placementClassYearsForClassId(row.class_id);
	let class_years: string[] | null = null;
	let rangeError = false;
	if (row.mode === "set") class_years = list.filter((y) => row.years.includes(y));
	else if (row.mode === "range") {
		const a = list.indexOf(row.from);
		const b = list.indexOf(row.to);
		rangeError = a < 0 || b < 0 || a > b;
		class_years = rangeError ? [] : list.slice(a, b + 1);
	}
	return {
		rule: {
			class_id: row.class_id as FeeRule["class_id"],
			class_years,
			teacher_id: row.teacher === "" ? null : Number(row.teacher),
			price: num(row.price),
		},
		rangeError,
	};
}

/** Field errors keyed `evaluation_fee`, `multi_enrollment_factor`, `<i>` (whole rule), `<i>.price`, `<i>.class_years`, `<i>.teacher_id`. */
function validate(form: FormState): { input: FeeCatalogInput; errors: Record<string, string> } {
	const percent = form.discount.trim() === "" ? NaN : Number(form.discount.replace(",", "."));
	const converted = form.rules.map(rowToRule);
	const rules = converted.map((c) => c.rule);
	const input: FeeCatalogInput = { evaluation_fee: num(form.evaluation_fee), multi_enrollment_factor: factorOfPercent(percent), rules };
	const errors: Record<string, string> = {};
	const add = (key: string, message: string) => {
		errors[key] ??= message;
	};
	converted.forEach((c, i) => c.rangeError && add(`${i}.class_years`, "Το εύρος ετών δεν είναι έγκυρο (το «από» πρέπει να προηγείται του «έως»)"));
	const parsed = z_FeeCatalogInput.safeParse(input);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			const [head, index, field] = issue.path;
			if (head === "rules" && typeof index === "number") add(typeof field === "string" ? `${index}.${field}` : String(index), issue.message);
			else if (typeof head === "string") add(head, issue.message);
		}
	}
	for (const { index, message } of feeRuleConflicts(rules)) add(String(index), message);
	if (Number.isNaN(percent) || percent < 0 || percent > 100) errors["multi_enrollment_factor"] = "Η έκπτωση πρέπει να είναι από 0% έως 100%";
	return { input, errors };
}

const ruleLabel = (rule: FeeRule, teacherName: (id: string) => string) =>
	`${DEPARTMENTS[rule.class_id]} · ${rule.teacher_id === null ? "όλοι οι καθηγητές" : teacherName(String(rule.teacher_id))} · ${yearsLabel(rule.class_id, rule.class_years)}`;
const ruleKey = (rule: FeeRule) => `${rule.class_id}|${rule.teacher_id ?? ""}|${rule.class_years?.join("¦") ?? "*"}`;

const BADGES = ["Καθηγητής + έτη", "Καθηγητής", "Έτη", "Βασική τιμή"];

/** Human-readable differences (or, without `prev`, a summary of every value). */
function describe(prev: FeeCatalogInput | null, next: FeeCatalogInput, teacherName: (id: string) => string): string[] {
	const lines: string[] = [];
	const setting = (label: string, before: number | undefined, after: number, fmt: (n: number) => string) => {
		if (before === undefined) lines.push(`${label}: ${fmt(after)}`);
		else if (before !== after) lines.push(`${label}: ${fmt(before)} → ${fmt(after)}`);
	};
	setting("Τέλος κατάταξης", prev?.evaluation_fee, next.evaluation_fee, euro);
	setting("Έκπτωση πολλαπλών εγγραφών", prev?.multi_enrollment_factor, next.multi_enrollment_factor, (f) => `${percentOfFactor(f)}%`);
	const before = new Map((prev?.rules ?? []).map((rule) => [ruleKey(rule), rule]));
	const after = new Map(next.rules.map((rule) => [ruleKey(rule), rule]));
	for (const [key, rule] of after) {
		const old = before.get(key);
		if (prev === null) lines.push(`${ruleLabel(rule, teacherName)}: ${euro(rule.price)}`);
		else if (!old) lines.push(`Νέος κανόνας · ${ruleLabel(rule, teacherName)}: ${euro(rule.price)}`);
		else if (old.price !== rule.price) lines.push(`${ruleLabel(rule, teacherName)}: ${euro(old.price)} → ${euro(rule.price)}`);
	}
	for (const [key, rule] of before) if (!after.has(key)) lines.push(`Αφαιρέθηκε κανόνας · ${ruleLabel(rule, teacherName)} (${euro(rule.price)})`);
	return lines;
}

const inputClass =
	"w-full rounded-md border border-red-900/40 dark:border-red-300/40 bg-white dark:bg-dark dark:text-red-50 px-2 py-1.5 focus-visible:outline-2 focus-visible:outline-red-900 dark:focus-visible:outline-red-300 aria-[invalid=true]:border-red-600";
const buttonClass =
	"w-fit rounded-md px-4 py-2 font-bold bg-red-900 text-red-50 hover:bg-red-950 disabled:opacity-60 disabled:cursor-not-allowed transition-colors";
const ghostButtonClass =
	"w-fit rounded-md px-3 py-1.5 font-bold border border-red-900 text-red-900 hover:bg-red-100 dark:border-red-300 dark:text-red-100 dark:hover:bg-red-950 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
const errorClass = "text-xs text-red-700 dark:text-red-300";
const hintClass = "text-xs text-gray-600 dark:text-gray-300";
const warnClass = "text-xs rounded-md bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100 px-2 py-1";

export default function FeeCatalogEditor() {
	const [years, setYears] = createSignal<string[]>([]);
	const [teachers, setTeachers] = createSignal<Teachers[]>([]);
	const [year, setYear] = createSignal(currentSchoolYear());
	const [loading, setLoading] = createSignal(true);
	const [loadError, setLoadError] = createSignal("");
	const [active, setActive] = createSignal<FeeCatalog | null>(null);
	const [versions, setVersions] = createSignal<FeeCatalog[]>([]);
	/** What the form was initialised from: the active version, or the template for a year with no catalog. */
	const [baseline, setBaseline] = createSignal<FeeCatalogInput>(SEED);
	const [form, setForm] = createStore<FormState>(toForm(SEED));
	const [showErrors, setShowErrors] = createSignal(false);
	const [confirming, setConfirming] = createSignal(false);
	const [saving, setSaving] = createSignal(false);
	let loadToken = 0;
	const uid = createUniqueId();

	const yearOptions = createMemo(() => {
		const start = currentSchoolYearStart();
		return [...new Set([...years(), schoolYearOf(start), schoolYearOf(start + 1)])].sort().reverse();
	});
	const teacherName = (id: string) => teachers().find((t) => String(t.id) === id)?.fullname ?? `Καθηγητής #${id}`;
	const checked = createMemo(() => validate(form));
	const errors = () => (showErrors() ? checked().errors : {});
	const changes = createMemo(() => describe(baseline(), checked().input, teacherName));
	const dirty = () => JSON.stringify(checked().input) !== JSON.stringify(baseline());
	// A year without a catalog can always save its first version; otherwise something must differ.
	const canSave = () => !saving() && !loading() && (active() === null || dirty());

	/** Any edit closes an open confirmation. */
	const edit = <T,>(apply: () => T): T => {
		setConfirming(false);
		return apply();
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
			let template: FeeCatalogInput = current ?? SEED;
			if (!current) {
				// Template: the newest existing version.
				const latestYear = years()[0];
				if (latestYear) {
					const latestRes = await apiCall(API.FeeCatalog.getActive, { UrlArgs: { school_year: latestYear } });
					if (token !== loadToken) return;
					if ("data" in latestRes && latestRes.data) template = latestRes.data;
				}
			}
			const { evaluation_fee, multi_enrollment_factor, rules } = template;
			const input: FeeCatalogInput = { evaluation_fee, multi_enrollment_factor, rules };
			setActive(current);
			setVersions("data" in versionsRes ? versionsRes.data : []);
			setBaseline(input);
			setForm(reconcile(toForm(input)));
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
		if (dirty() && active() !== null && !window.confirm("Οι αλλαγές που δεν έχουν αποθηκευτεί θα χαθούν. Συνέχεια;")) return;
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
			const res = await toast.promise(apiCall(API.FeeCatalog.create, { RequestObject: { school_year: schoolYear, ...checked().input } }), {
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

	const addRule = (classId: number) => {
		const list = placementClassYearsForClassId(classId);
		const hasBase = form.rules.some((r) => r.class_id === classId && r.mode === "all" && r.teacher === "");
		edit(() =>
			setForm("rules", form.rules.length, {
				key: createUniqueId(),
				class_id: classId,
				mode: hasBase ? "set" : "all",
				from: list[0] ?? "",
				to: list[list.length - 1] ?? "",
				years: [],
				teacher: "",
				price: "",
			}),
		);
	};
	const removeRule = (key: string) => edit(() => setForm("rules", (rules) => rules.filter((r) => r.key !== key)));

	/** "Τι ισχύει": the price per class year with no specific teacher, computed like the server does. */
	const summary = (classId: number) => {
		const rules = checked()
			.input.rules.filter((r) => Number.isFinite(r.price) && (r.class_years === null || r.class_years.length > 0))
			.map((r) => r);
		const rows = [...placementClassYearsForClassId(classId), ""].map((classYear) => ({
			label: classYear || AWAITING,
			awaiting: classYear === "",
			// teacher_id 0 never matches a teacher rule (ids start at 1).
			price: feeBase({ class_id: classId, class_year: classYear, teacher_id: 0 }, { rules }),
		}));
		const teacherRules = rules.filter((r) => r.class_id === classId && r.teacher_id !== null);
		return { rows, teacherRules };
	};

	const numberInput = (id: string, label: string, value: () => string, set: (v: string) => void, errorKey: string, suffix: string) => (
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
					class={`${inputClass} text-right tabular-nums`}
					value={value()}
					aria-invalid={errors()[errorKey] ? "true" : "false"}
					aria-describedby={errors()[errorKey] ? `${id}-err` : undefined}
					onInput={(e) => edit(() => set(e.currentTarget.value))}
				/>
				<span aria-hidden="true">{suffix}</span>
			</div>
			<Show when={errors()[errorKey]}>
				<p id={`${id}-err`} class={errorClass}>
					{errors()[errorKey]}
				</p>
			</Show>
		</div>
	);

	const fieldset = "grid gap-3 rounded-lg border-2 border-red-900/40 dark:border-red-300/40 p-4 min-w-0";
	const legend = "px-2 font-bold";

	const ruleEditor = (row: RuleRow, index: () => number) => {
		const id = `${uid}-r-${row.key}`;
		const list = placementClassYearsForClassId(row.class_id);
		const err = (field?: string) => errors()[field ? `${index()}.${field}` : String(index())];
		const rank = () => feeRuleRank({ class_years: row.mode === "all" ? null : [""], teacher_id: row.teacher === "" ? null : 1 });
		const setField = <K extends keyof RuleRow>(field: K, value: RuleRow[K]) => edit(() => setForm("rules", index(), field, value as never));
		return (
			<fieldset
				class="grid gap-3 rounded-md border-2 border-red-900/25 dark:border-red-300/25 bg-red-50/70 dark:bg-white/[0.04] p-3 min-w-0"
				aria-invalid={err() ? "true" : "false"}>
				<legend class="px-1 text-sm font-bold">
					Κανόνας {index() + 1}{" "}
					<span class="ml-1 rounded-full bg-red-100 dark:bg-red-950 px-2 py-0.5 text-xs font-normal" title="Προτεραιότητα του κανόνα">
						{BADGES[rank()]}
					</span>
				</legend>
				<Show when={err()}>
					<p class={errorClass} role="alert">
						{err()}
					</p>
				</Show>
				<div class="grid gap-3 sm:grid-cols-[1fr_1fr_8rem]">
					<div class="grid gap-1 min-w-0">
						<label for={`${id}-mode`} class="text-sm font-bold">
							Έτη φοίτησης
						</label>
						<select id={`${id}-mode`} class={inputClass} onChange={(e) => setField("mode", e.currentTarget.value as YearMode)}>
							<option value="all" selected={row.mode === "all"}>
								Όλα τα έτη
							</option>
							<option value="range" selected={row.mode === "range"}>
								Εύρος από … έως …
							</option>
							<option value="set" selected={row.mode === "set"}>
								Επιλογή ετών
							</option>
						</select>
					</div>
					<div class="grid gap-1 min-w-0">
						<label for={`${id}-teacher`} class="text-sm font-bold">
							Καθηγητής (προαιρετικά)
						</label>
						<select
							id={`${id}-teacher`}
							class={inputClass}
							aria-invalid={err("teacher_id") ? "true" : "false"}
							onChange={(e) => setField("teacher", e.currentTarget.value)}>
							<option value="" selected={row.teacher === ""}>
								Όλοι οι καθηγητές
							</option>
							<Show when={row.teacher !== "" && !teachers().some((t) => String(t.id) === row.teacher)}>
								<option value={row.teacher} selected>
									{teacherName(row.teacher)}
								</option>
							</Show>
							<For each={teachers()}>
								{(t) => (
									<option value={String(t.id)} selected={String(t.id) === row.teacher}>
										{t.fullname}
									</option>
								)}
							</For>
						</select>
						<Show when={err("teacher_id")}>
							<p class={errorClass}>{err("teacher_id")}</p>
						</Show>
					</div>
					{numberInput(
						`${id}-price`,
						"Τιμή",
						() => row.price,
						(v) => setForm("rules", index(), "price", v),
						`${index()}.price`,
						"€",
					)}
				</div>
				<Show when={row.mode === "range"}>
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="grid gap-1">
							<label for={`${id}-from`} class="text-sm">
								Από
							</label>
							<select
								id={`${id}-from`}
								class={inputClass}
								aria-invalid={err("class_years") ? "true" : "false"}
								onChange={(e) => setField("from", e.currentTarget.value)}>
								<For each={list}>
									{(y) => (
										<option value={y} selected={y === row.from}>
											{y}
										</option>
									)}
								</For>
							</select>
						</div>
						<div class="grid gap-1">
							<label for={`${id}-to`} class="text-sm">
								Έως
							</label>
							<select
								id={`${id}-to`}
								class={inputClass}
								aria-invalid={err("class_years") ? "true" : "false"}
								onChange={(e) => setField("to", e.currentTarget.value)}>
								<For each={list}>
									{(y) => (
										<option value={y} selected={y === row.to}>
											{y}
										</option>
									)}
								</For>
							</select>
						</div>
					</div>
				</Show>
				<Show when={row.mode === "set"}>
					<fieldset class="grid gap-1 min-w-0" aria-describedby={err("class_years") ? `${id}-years-err` : undefined}>
						<legend class="text-sm">Επιλογή ετών</legend>
						<div class="grid gap-x-4 gap-y-1 grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
							<For each={list}>
								{(y) => (
									<label class="flex items-center gap-2 text-sm">
										<input
											type="checkbox"
											checked={row.years.includes(y)}
											onChange={(e) => setField("years", e.currentTarget.checked ? [...row.years, y] : row.years.filter((v) => v !== y))}
										/>
										{y}
									</label>
								)}
							</For>
						</div>
					</fieldset>
				</Show>
				<Show when={err("class_years")}>
					<p id={`${id}-years-err`} class={errorClass}>
						{err("class_years")}
					</p>
				</Show>
				<button type="button" class={ghostButtonClass} aria-label={`Αφαίρεση κανόνα ${index() + 1}`} onClick={() => removeRule(row.key)}>
					<i class="fa-solid fa-trash mr-2" aria-hidden="true"></i>
					Αφαίρεση κανόνα
				</button>
			</fieldset>
		);
	};

	const section = (classId: number) => {
		const data = () => summary(classId);
		const noAllYears = () => !checked().input.rules.some((r) => r.class_id === classId && r.class_years === null && r.teacher_id === null);
		return (
			<fieldset class={fieldset}>
				<legend class={legend}>{DEPARTMENTS[classId]}</legend>
				<Show when={!form.rules.some((r) => r.class_id === classId)}>
					<p class={hintClass}>Κανένας κανόνας για αυτό το τμήμα.</p>
				</Show>
				<For each={form.rules}>{(row, index) => <Show when={row.class_id === classId}>{ruleEditor(row, index)}</Show>}</For>
				<button type="button" class={ghostButtonClass} onClick={() => addRule(classId)}>
					<i class="fa-solid fa-plus mr-2" aria-hidden="true"></i>
					Προσθήκη κανόνα
				</button>

				<div class="grid gap-2 rounded-md bg-red-50 dark:bg-gray-800 p-3">
					<h4 class="text-sm font-bold">Τι ισχύει · {DEPARTMENTS[classId]}</h4>
					<p class={hintClass}>Τιμή για μαθητή χωρίς ειδική τιμή καθηγητή.</p>
					<ul class="grid gap-1 text-sm sm:grid-cols-2">
						<For each={data().rows}>
							{(row) => (
								<li class="flex justify-between gap-2">
									<span>{row.label}</span>
									<Show
										when={row.price !== null}
										fallback={
											<span class="text-amber-700 dark:text-amber-300">{row.awaiting ? "μόνο τέλος κατάταξης" : "χωρίς τιμή"}</span>
										}>
										<span class="tabular-nums font-bold">{euro(row.price ?? 0)}</span>
									</Show>
								</li>
							)}
						</For>
					</ul>
					<For each={data().rows.filter((r) => r.price === null && !r.awaiting)}>
						{(row) => (
							<p class={warnClass} role="note">
								Το έτος «{row.label}» δεν έχει τιμή.
							</p>
						)}
					</For>
					<Show when={noAllYears()}>
						<p class={warnClass} role="note">
							Δεν υπάρχει κανόνας «Όλα τα έτη» χωρίς καθηγητή. Οι εγγραφές υπό κατάταξη θα χρεώνονται μόνο το τέλος κατάταξης μέχρι την
							τοποθέτηση.
						</p>
					</Show>
					<Show when={data().teacherRules.length > 0}>
						<div class="grid gap-1">
							<p class="text-sm font-bold">Ειδικές τιμές καθηγητών</p>
							<ul class="grid gap-0.5 text-sm">
								<For each={data().teacherRules}>
									{(rule) => (
										<li>
											{teacherName(String(rule.teacher_id))} · {yearsLabel(rule.class_id, rule.class_years)}:{" "}
											<span class="tabular-nums font-bold">{euro(rule.price)}</span>
										</li>
									)}
								</For>
							</ul>
						</div>
					</Show>
				</div>
			</fieldset>
		);
	};

	return (
		// The card and its heading come from the settings page (`PanelCollapsible`).
		<div class="grid gap-4">
			<div class="grid gap-1 sm:max-w-xs">
				<label for={`${uid}-year`} class="text-sm font-bold">
					Σχολικό έτος
				</label>
				<select
					id={`${uid}-year`}
					class={inputClass}
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
							Το σχολικό έτος {year()} δεν έχει κατάλογο διδάκτρων. Η φόρμα ξεκινά από τις τιμές της πιο πρόσφατης έκδοσης — αποθηκεύστε για να
							δημιουργήσετε την πρώτη έκδοση.
						</p>
					}>
					{(current) => (
						<p class={hintClass}>
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
						<legend class={legend}>Γενικές ρυθμίσεις</legend>
						<div class="grid gap-3 sm:grid-cols-2">
							{numberInput(
								`${uid}-eval`,
								"Τέλος κατάταξης",
								() => form.evaluation_fee,
								(v) => setForm("evaluation_fee", v),
								"evaluation_fee",
								"€",
							)}
							{numberInput(
								`${uid}-disc`,
								"Έκπτωση πολλαπλών εγγραφών (%)",
								() => form.discount,
								(v) => setForm("discount", v),
								"multi_enrollment_factor",
								"%",
							)}
						</div>
						<p class={hintClass}>
							Το τέλος κατάταξης είναι ένα για όλα τα τμήματα, ανά εγγραφή με κατάταξη, χωρίς έκπτωση. Η έκπτωση ισχύει για κάθε εγγραφή του
							μαθητή μετά την πρώτη του ίδιου σχολικού έτους.
						</p>
					</fieldset>

					<p class={hintClass}>Προτεραιότητα κανόνων (από τον ισχυρότερο): Καθηγητής + έτη, Καθηγητής (όλα τα έτη), Έτη, Βασική τιμή του τμήματος.</p>
					<For each={[...FEE_DEPARTMENT_ORDER]}>{(classId) => section(classId)}</For>

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

					<div class="grid gap-3">
						<p
							role="note"
							class="rounded-lg border-2 border-amber-600 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-50 p-3 text-sm font-bold">
							<i class="fa-solid fa-triangle-exclamation mr-2" aria-hidden="true"></i>Η νέα έκδοση ισχύει ΜΟΝΟ για τις νέες εγγραφές. Οι
							υπάρχουσες εγγραφές διατηρούν τις τιμές της έκδοσης με την οποία καταχωρήθηκαν.
						</p>
						<button type="submit" class={buttonClass} disabled={!canSave() || confirming()}>
							Αποθήκευση νέας έκδοσης
						</button>
					</div>
				</form>

				<div class="grid gap-2">
					<h3 class="font-bold">Ιστορικό εκδόσεων</h3>
					<Show when={versions().length > 0} fallback={<p class="text-sm dark:text-gray-300">Δεν υπάρχουν εκδόσεις για το {year()}.</p>}>
						<ul class="grid gap-2">
							<For each={versions()}>
								{(version, i) => {
									const previous = () => versions()[i() + 1];
									const lines = () => describe(previous() ?? null, version, teacherName);
									return (
										<li>
											<details class="rounded-md border border-red-900/40 dark:border-red-300/40 p-2">
												<summary class="cursor-pointer text-sm">
													<span class="font-bold">#{version.id}</span> · {formatDate(version.created_at)} ·{" "}
													{version.created_by ?? "άγνωστος"}
													{i() === 0 ? " · ενεργή" : ""}
												</summary>
												<p class={`mt-2 ${hintClass}`}>
													{previous() ? `Αλλαγές σε σχέση με την έκδοση #${previous()!.id}` : "Αρχική έκδοση — τιμές"}
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
		</div>
	);
}
