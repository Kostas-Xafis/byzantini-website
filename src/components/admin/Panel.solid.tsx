import { Show, createSignal, type JSX } from "solid-js";

/**
 * Building blocks of the admin "panel" pages (Ρυθμίσεις, Ο λογαριασμός μου): a centred, scrollable
 * page column, plain cards and collapsible cards. Collapsibles are native `<details>` (keyboard and
 * screen-reader support for free) and remember, per device, whether they were left open.
 *
 * Dark mode: AdminLayout repaints every `.bg-white` as the dashboard's dark surface, so cards use
 * `bg-white`; anything that must stay white in both themes (brand marks) uses `bg-[#fff]`.
 */

export const cardClass = "rounded-2xl border border-line bg-surface text-ink shadow-sm shadow-red-950/10 dark:shadow-black/40";
export const primaryButtonClass =
	"inline-flex items-center justify-center gap-2 w-fit rounded-lg px-4 py-2 font-bold bg-brand text-brand-ink hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900 disabled:opacity-60 disabled:cursor-not-allowed transition-colors";
export const secondaryButtonClass =
	"inline-flex items-center justify-center gap-2 w-fit rounded-lg px-3 py-1.5 text-sm font-bold border border-brand/60 text-brand hover:bg-accent-soft dark:border-red-300/50 dark:text-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
export const inputClass =
	"w-full max-w-sm rounded-lg border border-line bg-surface-muted px-3 py-2 text-ink focus:outline-hidden focus:ring-2 focus:ring-red-900/40 dark:focus:ring-red-300/40";
export const hintClass = "text-sm text-ink-muted";

/** Centred page column (desktop) that scrolls inside the admin shell. */
export function PanelPage(props: { title: string; subtitle?: JSX.Element; children: JSX.Element }) {
	return (
		<div class="w-full h-full min-h-0 overflow-y-auto bg-page text-ink">
			<div class="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-10 grid gap-5">
				<header class="grid gap-1">
					<h1 class="font-anaktoria text-4xl">{props.title}</h1>
					<Show when={props.subtitle}>
						<p class="text-sm sm:text-base text-ink-muted">{props.subtitle}</p>
					</Show>
				</header>
				{props.children}
			</div>
		</div>
	);
}

type CardHeaderProps = { icon: string; title: string; description?: JSX.Element; aside?: JSX.Element };

function CardHeader(props: CardHeaderProps) {
	return (
		<div class="flex items-start gap-3 min-w-0">
			<span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-brand dark:text-red-200" aria-hidden="true">
				<i class={`${props.icon} text-lg`}></i>
			</span>
			<div class="grid gap-0.5 min-w-0 flex-1">
				<h2 class="font-anaktoria text-2xl leading-tight">{props.title}</h2>
				<Show when={props.description}>
					<p class={hintClass}>{props.description}</p>
				</Show>
			</div>
			{props.aside}
		</div>
	);
}

/** An always-open card. */
export function PanelCard(props: CardHeaderProps & { id?: string; children: JSX.Element }) {
	return (
		<section id={props.id} class={`${cardClass} p-5 sm:p-6 grid gap-5`}>
			<CardHeader icon={props.icon} title={props.title} description={props.description} aside={props.aside} />
			{props.children}
		</section>
	);
}

const storageKey = (id: string) => `admin-panel-open:${id}`;

/**
 * A card whose body folds away. `id` keys the remembered state (and is the anchor to open it from a link,
 * see `openPanel`); `badge` stays visible while folded (e.g. a count).
 */
export function PanelCollapsible(props: CardHeaderProps & { id: string; badge?: JSX.Element; defaultOpen?: boolean; children: JSX.Element }) {
	// Read up front (the admin island is client-only), so a panel left open does not flash closed.
	const remembered = () => {
		try {
			const stored = localStorage.getItem(storageKey(props.id));
			return stored === null ? undefined : stored === "1";
		} catch {
			return undefined;
		}
	};
	const [open, setOpen] = createSignal(remembered() ?? props.defaultOpen ?? false);
	const onToggle = (e: Event) => {
		const next = (e.currentTarget as HTMLDetailsElement).open;
		setOpen(next);
		try {
			localStorage.setItem(storageKey(props.id), next ? "1" : "0");
		} catch {}
	};
	return (
		<details id={props.id} class={`${cardClass} group/panel`} open={open()} onToggle={onToggle}>
			<summary class="flex cursor-pointer list-none items-center gap-3 rounded-2xl p-5 sm:p-6 select-none hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-red-900 [&::-webkit-details-marker]:hidden">
				<div class="flex-1 min-w-0">
					<CardHeader icon={props.icon} title={props.title} description={props.description} />
				</div>
				{props.badge}
				<i
					class="fa-solid fa-chevron-down shrink-0 text-brand/70 dark:text-red-200/70 transition-transform duration-200 group-open/panel:rotate-180 motion-reduce:transition-none"
					aria-hidden="true"></i>
			</summary>
			<div class="grid gap-5 px-5 pb-5 sm:px-6 sm:pb-6">{props.children}</div>
		</details>
	);
}

/** Opens a collapsible by id and scrolls it into view (e.g. «Αλλαγή» next to the password row). */
export function openPanel(id: string) {
	const panel = document.getElementById(id);
	if (panel instanceof HTMLDetailsElement && !panel.open) panel.open = true;
	panel?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function Badge(props: { children: JSX.Element; tone?: "neutral" | "success" }) {
	return (
		<span
			class={
				"shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold " +
				(props.tone === "success"
					? "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-100"
					: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100")
			}>
			{props.children}
		</span>
	);
}
