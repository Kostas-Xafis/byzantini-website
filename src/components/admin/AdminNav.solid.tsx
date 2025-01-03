import { A, type RouterProps } from "@solidjs/router";
import { createSignal } from "solid-js";

const links = [
	{ name: "Αρχική", url: "/admin", force: false },
	{ name: "Εγγραφές", url: "/admin/registrations", force: false },
	{ name: "Βιβλία", url: "/admin/books", force: false },
	{ name: "Οφειλές Μαθητών", url: "/admin/payments", force: false },
	{ name: "Οφειλές Σχολής", url: "/admin/payoffs", force: false },
	{ name: "Καθηγητές", url: "/admin/teachers", force: false },
	{ name: "Παραρτήματα", url: "/admin/locations", force: false },
	{ name: "Ανακοινώσεις", url: "/admin/announcements", force: false },
	{ name: "Διαχειριστές", url: "/admin/sysusers", force: false },
	{ name: "Έξοδος", url: "/admin/logout", force: true },
];

// force pathname change
const forceURLChange = (pathname: string) => (window.location.pathname = pathname);

export default function AdminNav(props: RouterProps) {
	const firstPage =
		links.find(
			(link) =>
				link.url === window.location.pathname || link.url + "/" === window.location.pathname
		)?.name ?? "Αρχική";
	const [currentPage, setCurrentPage] = createSignal(firstPage);
	return (
		<>
			<nav
				class={
					"pt-4 grid grid-rows-[80px_1fr] bg-red-900 overflow-y-auto overflow-x-hidden max-sm:py-1 max-sm:gap-y-2 max-sm:flex max-sm:z-50 flex-col max-sm:overflow-visible max-sm:sticky max-sm:top-0" +
					" max-sm:flex-row max-sm:p-1"
				}>
				<div class="relative grid place-items-center gap-x-4 font-anaktoria">
					<a
						href="/"
						class="logoImg w-[70px] max-sm:w-[50px] row-span-full aspect-square z-20"
						onClick={(e) => {
							e.preventDefault(); // prevent router from changing url
							forceURLChange("/");
						}}>
						<div class="w-full h-full bg-red-50"></div>
						<img class="hidden" src="/logo.png" alt="Λογότυπο Σχολής" />
					</a>
					{/* <!-- 50% width - 40px (50% of img) - 2px offset --> */}
					<div class="logoImg w-[70px] max-sm:w-[50px] aspect-square absolute top-[6px] blur-2xl z-10 left-[calc(50%_-_35px_-_2px)] max-sm:left-[calc(50%_-_26px)] max-sm:top-[1px]">
						<div class="w-full h-full bg-[rgb(0_0_0_/_0.75)]"></div>
					</div>
				</div>
				<div
					class={`h-full grid auto-rows-min grid-cols-1 grid-flow-row self-start py-1 content-evenly max-sm:hidden`}>
					{links.map((link) => (
						<A
							class="group relative py-2 grid grid-rows-[minmax(min-content, 70px)] place-content-center transition-colors duration-150 ease-[cubic-bezier(0,.8,.43,.64)]  hover:bg-red-950 drop-shadow-[-3px_1px_2px_rgba(0,0,0,0.35)]"
							href={link.url}
							rel="prefetch-intent"
							onClick={(link.force && (() => forceURLChange(link.url))) || undefined}>
							<p class="group font-bold font-anaktoria text-1.5xl text-red-50 text-center">
								{link.name}
							</p>
						</A>
					))}
				</div>
				<div
					id="burgerNav"
					class="group/nav relative sm:hidden w-full flex flex-col justify-center py-1">
					<p class="relative self-center w-max text-center text-xl leading-6 font-bold font-anaktoria text-red-50 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)] transition-transform group-[:is(.open)]/nav:translate-x-[calc(50%_-_7px)]">
						{/* 7px = 1/2 of 14px = 0.875rem */}
						<i class="absolute text-sm top-[50%] translate-y-[-50%] left-0 translate-x-[calc(-100%_-_0.5rem)] fa-solid fa-bars text-red-50 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.75)]"></i>
						<span class="opacity-100 transition-opacity group-[:is(.open)]/nav:opacity-0 drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.75)]">
							{currentPage()}
						</span>
					</p>
					<div class="hidden fixed top-[3.5rem] left-0 right-0 h-max flex-col w-full z-[5000]">
						{links.map((link) => (
							<A
								class="relative grid py-4 bg-red-900 opacity-0 transition-opacity ease-in-out group-[:is(.open)]/nav:opacity-100"
								onClick={
									(link.force && (() => forceURLChange(link.url))) ||
									(() => setCurrentPage(link.name))
								}
								href={link.url}>
								<p class="px-2 font-bold font-anaktoria text-red-50 whitespace-nowrap drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)] text-center text-xl">
									{link.name}
								</p>
							</A>
						))}
					</div>
				</div>
				<style>
					{`.logoImg {
				mask-image: url("/logo.png");
				-webkit-mask-image: url("/logo.png");
				mask-size: contain;
				-webkit-mask-size: contain;
			}
			/* Subpixel gaps for no reason at all.... */
			#burgerNav a:nth-child(10) {
				transition-duration: 0.475s;
				transform: translateY(-10px);
			}
			#burgerNav a:nth-child(9) {
				transition-duration: 0.5s;
				transform: translateY(-9px);
			}
			#burgerNav a:nth-child(8) {
				transition-duration: 0.525s;
				transform: translateY(-8px);
			}
			#burgerNav a:nth-child(7) {
				transition-duration: 0.55s;
				transform: translateY(-7px);
			}
			#burgerNav a:nth-child(6) {
				transition-duration: 0.575s;
				transform: translateY(-6px);
			}
			#burgerNav a:nth-child(5) {
				transition-duration: 0.6s;
				transform: translateY(-5px);
			}
			#burgerNav a:nth-child(4) {
				transition-duration: 0.625s;
				transform: translateY(-4px);
			}
			#burgerNav a:nth-child(3) {
				transition-duration: 0.65s;
				transform: translateY(-3px);
			}
			#burgerNav a:nth-child(2) {
				transition-duration: 0.675s;
				transform: translateY(-2px);
			}
			#burgerNav a:nth-child(1) {
				transition-duration: 0.7s;
				transform: translateY(-1px);
			}
			#burgerNav:is(.open) a:nth-child(1) {
				transition-duration: 0.6s;
			}
			#burgerNav:is(.open) a:nth-child(2) {
				transition-duration: 0.625s;
			}
			#burgerNav:is(.open) a:nth-child(3) {
				transition-duration: 0.65s;
			}
			#burgerNav:is(.open) a:nth-child(4) {
				transition-duration: 0.675s;
			}
			#burgerNav:is(.open) a:nth-child(5) {
				transition-duration: 0.7s;
			}
			#burgerNav:is(.open) a:nth-child(6) {
				transition-duration: 0.725s;
			}
			#burgerNav:is(.open) a:nth-child(7) {
				transition-duration: 0.75s;
			}
			#burgerNav:is(.open) a:nth-child(8) {
				transition-duration: 0.775s;
			}
			#burgerNav:is(.open) a:nth-child(9) {
				transition-duration: 0.8s;
			}
			#burgerNav:is(.open) a:nth-child(10) {
				transition-duration: 0.825s;
			}`}
				</style>
			</nav>
			{props.children as any}
		</>
	);
}
