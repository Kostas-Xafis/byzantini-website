import { isOwnerEmail } from "@env/ownerEmail";
import { A, useLocation, type RouterProps } from "@solidjs/router";
import { sleep } from "@utilities/sleep";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

type NavLink = { name: string; url: string; force: boolean; icon: string };
type NavSection = { title: string | null; links: NavLink[] };

const sections: NavSection[] = [
	{
		title: null,
		links: [{ name: "Αρχική", url: "/admin", force: false, icon: "fa-solid fa-house" }],
	},
	{
		title: "Σχολή",
		links: [
			{ name: "Εγγραφές", url: "/admin/registrations", force: false, icon: "fa-solid fa-clipboard-list" },
			{ name: "Καθηγητές", url: "/admin/teachers", force: false, icon: "fa-solid fa-chalkboard-user" },
			{ name: "Παραρτήματα", url: "/admin/locations", force: false, icon: "fa-solid fa-location-dot" },
			{ name: "Βιβλία", url: "/admin/books", force: false, icon: "fa-solid fa-book" },
			{ name: "Ανακοινώσεις", url: "/admin/announcements", force: false, icon: "fa-solid fa-bullhorn" },
		],
	},
	{
		title: "Οικονομικά",
		links: [
			{ name: "Οφειλές Μαθητών", url: "/admin/payments", force: false, icon: "fa-solid fa-hand-holding-dollar" },
			{ name: "Οφειλές Σχολής", url: "/admin/payoffs", force: false, icon: "fa-solid fa-file-invoice-dollar" },
		],
	},
	{
		title: "Σύστημα",
		links: [
			{ name: "Διαχειριστές", url: "/admin/sysusers", force: false, icon: "fa-solid fa-users-gear" },
			{ name: "Καταγραφή Ερωτημάτων", url: "/admin/query-logs", force: false, icon: "fa-solid fa-database" },
			{ name: "Ρυθμίσεις", url: "/admin/settings", force: false, icon: "fa-solid fa-gear" },
			{ name: "Έξοδος", url: "/admin/logout", force: true, icon: "fa-solid fa-right-from-bracket" },
		],
	},
];

// force pathname change
const forceURLChange = (pathname: string) => (window.location.pathname = pathname);

const linkBaseClasses =
	"group relative flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 ease-[cubic-bezier(0,.8,.43,.64)] hover:bg-red-950/60 dark:hover:bg-red-800/60";
// NOTE: the left detail bar is NOT painted here anymore — a single sliding
// indicator (see `indicatorTop/Height` below) draws it, so the bar can animate
// between pages instead of just blinking on/off.
const linkActiveClasses = " bg-red-950 dark:bg-red-900 text-white";

const mobileLinkBaseClasses =
	"relative grid py-4 bg-red-900 dark:bg-red-950 opacity-0 transition-[background-color,opacity,transform] ease-in-out group-has-checked/nav:opacity-100 hover:bg-red-950/60 dark:hover:bg-red-800/60";
const mobileLinkActiveClasses = " bg-red-950 dark:bg-red-900! shadow-[inset_4px_0_0_0_rgba(254,202,202,0.9)]";

const measureIndicator = (list: HTMLDivElement | undefined) => {
	if (!list) return null;
	const active = list.querySelector<HTMLElement>('a[aria-current="page"]');
	if (!active) return null;
	const listRect = list.getBoundingClientRect();
	const activeRect = active.getBoundingClientRect();
	return {
		// `activeRect.top - listRect.top` is in the same coordinate space the
		// absolutely-positioned bar uses (the list is its containing block),
		// so it lands exactly on the active link — unlike offsetTop, which is
		// measured against each element's own offsetParent.
		top: activeRect.top - listRect.top,
		height: activeRect.height,
	};
};

export default function AdminNav(props: RouterProps) {
	type StoredSysUser = {
		email?: string | null;
		avatar_url?: string | null;
	};
	const user = JSON.parse(localStorage.getItem("sys_user") || "{}") as StoredSysUser;
	const isOwner = () => isOwnerEmail(user.email);

	const location = useLocation();

	const isActive = (url: string) => location.pathname === url || location.pathname === url + "/";

	const visibleSections = createMemo(() =>
		sections
			.map((section) => ({
				...section,
				links: section.links.filter((link) => link.url !== "/admin/query-logs" || isOwner()),
			}))
			.filter((section) => section.links.length > 0),
	);
	const flatLinks = createMemo(() => visibleSections().flatMap((section) => section.links));

	const [currentPage, setCurrentPage] = createSignal("Αρχική");

	let desktopListEl: HTMLDivElement | undefined;
	let indicator: HTMLSpanElement | undefined;

	let burgerNavToggle: HTMLInputElement | undefined;

	createEffect(() => {
		const found = flatLinks().find((link) => isActive(link.url));
		if (found) {
			const geometry = measureIndicator(desktopListEl);
			if (indicator) {
				indicator.style.top = `${geometry?.top}px`;
				indicator.style.height = `${geometry?.height}px`;
			}
			setCurrentPage(found.name);
		}
	});

	return (
		<>
			<nav
				aria-label="Πλοήγηση διαχείρισης"
				class={
					"pt-4 grid grid-rows-[auto_1fr] bg-red-900 dark:bg-red-950 overflow-y-auto overflow-x-hidden max-sm:py-1 max-sm:gap-y-2 max-sm:flex max-sm:z-50 flex-col max-sm:overflow-visible max-sm:sticky max-sm:top-0" +
					" max-sm:flex-row max-sm:p-1"
				}>
				<div class="relative grid justify-items-center content-start gap-y-2 font-anaktoria">
					<a
						href="/"
						class="w-[70px] max-sm:w-[50px] row-span-full aspect-square z-20 relative"
						onClick={(e) => {
							e.preventDefault(); // prevent router from changing url
							forceURLChange("/");
						}}>
						<img
							src="/logo.png"
							alt="Λογότυπο Σχολής"
							class="h-full w-full object-contain brightness-0 invert contrast-125 drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]"
						/>
					</a>
					{/* <!-- 50% width - 40px (50% of img) - 2px offset --> */}
					<div class="w-[70px] max-sm:w-[50px] aspect-square absolute top-[2px] blur-xl opacity-40 z-10 left-[calc(50%_-_35px_-_2px)] max-sm:left-[calc(50%_-_26px)] max-sm:top-[1px] pointer-events-none">
						<img src="/logo.png" alt="" aria-hidden="true" class="h-full w-full object-contain brightness-0" />
					</div>
					<div class="max-sm:hidden w-[170px] px-2 flex items-center justify-center gap-2">
						<div class="h-7 w-7 shrink-0 rounded-full border border-red-100 bg-red-200 dark:bg-red-900 overflow-hidden grid place-items-center text-[10px] text-red-900 dark:text-red-100 shadow-md shadow-black/30">
							{user.avatar_url ? <img src={user.avatar_url} alt="Avatar" class="h-full w-full object-cover" /> : <i class="fa-solid fa-user"></i>}
						</div>
						<p class="text-left text-sm leading-4 text-red-100 dark:text-red-200 break-all">{user.email}</p>
					</div>
				</div>
				<div ref={desktopListEl} class="relative h-full grid auto-rows-min grid-cols-1 grid-flow-row self-start pt-4 content-start max-sm:hidden">
					<span
						ref={indicator}
						data-nav-indicator
						aria-hidden="true"
						class="pointer-events-none absolute left-0 z-10 w-1 rounded-r-full bg-red-200/90 transition-[top,height] duration-250 ease-in-out"
					/>
					<For each={visibleSections()}>
						{(section) => (
							<>
								<Show when={section.title}>
									<p class="px-4 pt-2 pb-2 text-[12px] font-bold uppercase tracking-[0.14em] bg-red-950 dark:bg-red-900 text-red-100 dark:text-red-200/70 ">
										{section.title}
									</p>
								</Show>
								<For each={section.links}>
									{(link) => (
										<A
											href={link.url}
											rel="prefetch-intent"
											aria-current={isActive(link.url) ? "page" : undefined}
											class={linkBaseClasses + (isActive(link.url) ? linkActiveClasses : "")}
											onClick={(link.force && (() => forceURLChange(link.url))) || undefined}>
											<i class={`${link.icon} w-5 text-center text-base text-red-200/90`} aria-hidden="true"></i>
											<p class="font-bold font-anaktoria text-lg text-red-50">{link.name}</p>
										</A>
									)}
								</For>
							</>
						)}
					</For>
				</div>
				<div id="burgerNav" class="group/nav relative sm:hidden w-full flex flex-col justify-center py-1">
					<div class="peer overflow-hidden opacity-0 absolute inset-0 flex justify-center z-10">
						<input type="checkbox" ref={burgerNavToggle} id="burgerNavToggle" class="scale-[30]" />
					</div>
					<button
						type="button"
						aria-controls="burgerNavMenu"
						class="relative self-center w-max text-center text-xl leading-6 font-bold font-anaktoria text-red-50 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)] transition-transform group-has-checked/nav:translate-x-[calc(50%_-_7px)]">
						{/* 7px = 1/2 of 14px = 0.875rem */}
						<i class="absolute text-sm top-[50%] translate-y-[-50%] left-0 translate-x-[calc(-100%_-_0.5rem)] fa-solid fa-bars text-red-50 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.75)]"></i>
						<span class="opacity-100 transition-opacity group-has-checked/nav:opacity-0 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.75)]">
							{currentPage()}
						</span>
					</button>
					<div
						id="burgerNavMenu"
						class="flex invisible opacity-0 pointer-events-none transition-[opacity,visibility] duration-300 group-has-checked/nav:visible group-has-checked/nav:opacity-100 group-has-checked/nav:pointer-events-auto fixed top-[3.5rem] left-0 right-0 max-h-[calc(100dvh-3.5rem)] h-dvh bg-red-900 dark:bg-red-950 gap-0.5 overflow-y-auto flex-col w-full z-[5000]">
						<For each={visibleSections()}>
							{(section) => (
								<div>
									<Show when={section.title}>
										<p class="px-4 pt-3 pb-3 text-[12px] font-bold uppercase tracking-[0.14em] bg-red-950 dark:bg-red-900 text-red-100 opacity-0 transition-opacity ease-in-out group-has-checked/nav:opacity-100">
											{section.title}
										</p>
									</Show>
									<For each={section.links}>
										{(link) => (
											<A
												class={mobileLinkBaseClasses + (isActive(link.url) ? mobileLinkActiveClasses : "")}
												aria-current={isActive(link.url) ? "page" : undefined}
												onClick={
													(link.force && (() => forceURLChange(link.url))) ||
													(() => {
														sleep(300).then(() => burgerNavToggle && (burgerNavToggle.checked = false));
														setCurrentPage(link.name);
													})
												}
												href={link.url}>
												<p class="px-2 font-bold font-anaktoria text-red-50 whitespace-nowrap drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)] text-center text-xl">
													<i class={`${link.icon} mr-2 text-base text-red-200/90`} aria-hidden="true"></i>
													{link.name}
												</p>
											</A>
										)}
									</For>
								</div>
							)}
						</For>
					</div>
				</div>
				<style>
					{`/* Staggered slide-down for the mobile menu. Selectors are
			count-independent: :nth-of-type counts only <a> siblings, ignoring
			section headings, so hiding a link never breaks the sequence. */
			#burgerNavMenu a:nth-of-type(11) {
				transition-duration: 0.475s;
				transform: translateY(-10px);
			}
			#burgerNavMenu a:nth-of-type(10) {
				transition-duration: 0.5s;
				transform: translateY(-9px);
			}
			#burgerNavMenu a:nth-of-type(9) {
				transition-duration: 0.525s;
				transform: translateY(-8px);
			}
			#burgerNavMenu a:nth-of-type(8) {
				transition-duration: 0.55s;
				transform: translateY(-7px);
			}
			#burgerNavMenu a:nth-of-type(7) {
				transition-duration: 0.575s;
				transform: translateY(-6px);
			}
			#burgerNavMenu a:nth-of-type(6) {
				transition-duration: 0.6s;
				transform: translateY(-5px);
			}
			#burgerNavMenu a:nth-of-type(5) {
				transition-duration: 0.625s;
				transform: translateY(-4px);
			}
			#burgerNavMenu a:nth-of-type(4) {
				transition-duration: 0.65s;
				transform: translateY(-3px);
			}
			#burgerNavMenu a:nth-of-type(3) {
				transition-duration: 0.675s;
				transform: translateY(-2px);
			}
			#burgerNavMenu a:nth-of-type(2) {
				transition-duration: 0.7s;
				transform: translateY(-1px);
			}
			#burgerNavMenu a:nth-of-type(1) {
				transition-duration: 0.725s;
				transform: translateY(0px);
			}
			#burgerNav:has(:checked) a:nth-of-type(1) {
				transition-duration: 0.6s;
			}
			#burgerNav:has(:checked) a:nth-of-type(2) {
				transition-duration: 0.625s;
			}
			#burgerNav:has(:checked) a:nth-of-type(3) {
				transition-duration: 0.65s;
			}
			#burgerNav:has(:checked) a:nth-of-type(4) {
				transition-duration: 0.675s;
			}
			#burgerNav:has(:checked) a:nth-of-type(11) {
				transition-duration: 0.85s;
			}
			#burgerNav:has(:checked) a:nth-of-type(5) {
				transition-duration: 0.7s;
			}
			#burgerNav:has(:checked) a:nth-of-type(6) {
				transition-duration: 0.725s;
			}
			#burgerNav:has(:checked) a:nth-of-type(7) {
				transition-duration: 0.75s;
			}
			#burgerNav:has(:checked) a:nth-of-type(8) {
				transition-duration: 0.775s;
			}
			#burgerNav:has(:checked) a:nth-of-type(9) {
				transition-duration: 0.8s;
			}
			#burgerNav:has(:checked) a:nth-of-type(10) {
				transition-duration: 0.825s;
			}
			/* Reset the per-link offsets when open so the staggered
			translateY slide-down actually transitions. */
			#burgerNav:has(:checked) #burgerNavMenu a {
				transform: translateY(0);
			}`}
				</style>
			</nav>
			{props.children as any}
		</>
	);
}
