import { apiCall } from "@hooks/apiCall";
import { startOAuth } from "@lib/auth/oauth.client";
import type { APIResponse } from "@routes/index.client";
import { For, Show, createMemo, createSignal, onMount } from "solid-js";
import { PROVIDER_ICONS } from "@lib/auth/providerIcons";
import { ROLE_LABELS } from "@lib/auth/roles";
import { refreshCurrentUser, useCurrentUser } from "./currentUser";
import {
	Badge,
	PanelCard,
	PanelCollapsible,
	PanelPage,
	cardClass,
	hintClass,
	inputClass,
	openPanel,
	primaryButtonClass,
	secondaryButtonClass,
} from "./Panel.solid";
import { toast } from "./toast";

/**
 * «Ο λογαριασμός μου» — the signed-in admin's ways in and devices:
 * - sign-in providers (Google / Apple / Microsoft) to connect or disconnect;
 * - the password (set, or change — the current one is asked unless the sign-in is recent);
 * - signed-in devices (sessions), each of which can be signed out.
 */

type Session = APIResponse["Authentication.sessions"][number];

const dateTime = (ms: number) => new Date(ms).toLocaleString("el-GR", { dateStyle: "medium", timeStyle: "short" });

const methodLabel = (method: string) => ({ password: "Κωδικός", google: "Google", apple: "Apple", microsoft: "Microsoft" })[method] ?? method;

/** "Chrome · Windows" from a user agent — enough to tell devices apart. */
function deviceLabel(userAgent: string | null): string {
	if (!userAgent) return "Άγνωστη συσκευή";
	const browser = /Edg\//.test(userAgent)
		? "Edge"
		: /OPR\//.test(userAgent)
			? "Opera"
			: /Firefox\//.test(userAgent)
				? "Firefox"
				: /Chrome\//.test(userAgent)
					? "Chrome"
					: /Safari\//.test(userAgent)
						? "Safari"
						: "Browser";
	const os = /iPhone|iPad/.test(userAgent)
		? "iOS"
		: /Android/.test(userAgent)
			? "Android"
			: /Windows/.test(userAgent)
				? "Windows"
				: /Mac OS X/.test(userAgent)
					? "macOS"
					: /Linux/.test(userAgent)
						? "Linux"
						: "";
	return os ? `${browser} · ${os}` : browser;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export default function AccountPage() {
	const user = useCurrentUser();
	const [sessions, setSessions] = createSignal<Session[]>([]);
	const [busy, setBusy] = createSignal<string | null>(null);

	const loadSessions = async () => {
		try {
			const res = await apiCall("Authentication.sessions");
			if ("data" in res) setSessions(res.data);
		} catch (error) {
			toast.error(error, { title: "Αποτυχία φόρτωσης συσκευών" });
		}
	};

	onMount(() => {
		void loadSessions();
		// Back from a provider (lib/api/routes/authentication.ts → `?linked=<provider>`).
		const params = new URLSearchParams(window.location.search);
		const linked = params.get("linked");
		if (linked) {
			toast.success(`Ο λογαριασμός ${methodLabel(linked)} συνδέθηκε. Μπορείτε πλέον να τον χρησιμοποιείτε για είσοδο.`, { title: "Σύνδεση λογαριασμού" });
			params.delete("linked");
			const query = params.toString();
			window.history.replaceState(window.history.state, "", window.location.pathname + (query ? `?${query}` : ""));
			void refreshCurrentUser();
		}
	});

	/** Every provider worth a row: enabled here, or already connected (even if disabled in this environment). */
	const providerRows = createMemo(() => {
		const me = user();
		if (!me) return [];
		const rows = me.providers.map((p) => ({ ...p, identity: me.identities.find((i) => i.id === p.id) }));
		for (const identity of me.identities) if (!rows.some((r) => r.id === identity.id)) rows.push({ ...identity, identity });
		return rows;
	});
	const signInMethods = () => (user()?.hasPassword ? 1 : 0) + (user()?.identities.length ?? 0);

	const connect = async (provider: string) => {
		setBusy(`link:${provider}`);
		try {
			await startOAuth(provider, { intent: "link" });
		} catch (error) {
			toast.error(errorText(error), { title: "Αποτυχία σύνδεσης λογαριασμού" });
			setBusy(null);
		}
	};

	const disconnect = async (provider: string, label: string) => {
		const warning =
			user()?.identities.length === 1 && user()?.hasPassword
				? "\n\nΘα μπορείτε να συνδέεστε μόνο με τον κωδικό σας — βεβαιωθείτε ότι τον γνωρίζετε."
				: "";
		if (!window.confirm(`Αποσύνδεση του λογαριασμού ${label}; Δεν θα μπορείτε πλέον να συνδέεστε με αυτόν.${warning}`)) return;
		setBusy(`unlink:${provider}`);
		try {
			const res = await apiCall("Authentication.unlinkProvider", { UrlArgs: { provider } });
			toast.success("message" in res ? res.message : "Ο λογαριασμός αποσυνδέθηκε");
			await refreshCurrentUser();
		} catch (error) {
			toast.error(errorText(error), { title: "Αποτυχία αποσύνδεσης" });
		} finally {
			setBusy(null);
		}
	};

	let passwordForm!: HTMLFormElement;
	const [passwordError, setPasswordError] = createSignal("");
	const onPasswordSubmit = async (e: SubmitEvent) => {
		e.preventDefault();
		setPasswordError("");
		const data = new FormData(passwordForm);
		const current = (data.get("current_password") as string | null) ?? "";
		const next = data.get("new_password") as string;
		if (next.length < 8) return setPasswordError("Ο νέος κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες");
		if (next !== data.get("confirm_password")) return setPasswordError("Οι δύο κωδικοί δεν ταιριάζουν");
		setBusy("password");
		try {
			const res = await apiCall("Authentication.changePassword", {
				RequestObject: { new_password: next, ...(current ? { current_password: current } : {}) },
			});
			toast.success("message" in res ? res.message : "Ο κωδικός άλλαξε", { title: "Κωδικός" });
			passwordForm.reset();
			await Promise.all([refreshCurrentUser(), loadSessions()]);
		} catch (error) {
			setPasswordError(errorText(error));
		} finally {
			setBusy(null);
		}
	};

	const signOutSession = async (session: Session) => {
		if (session.current && !window.confirm("Αποσύνδεση από αυτή τη συσκευή;")) return;
		setBusy(`session:${session.id}`);
		try {
			await apiCall("Authentication.revokeSession", { UrlArgs: { id: session.id } });
			if (session.current) {
				window.location.href = "/login";
				return;
			}
			toast.success("Η συσκευή αποσυνδέθηκε");
			await loadSessions();
		} catch (error) {
			toast.error(errorText(error), { title: "Αποτυχία αποσύνδεσης συσκευής" });
		} finally {
			setBusy(null);
		}
	};

	const signOutOthers = async () => {
		if (!window.confirm("Αποσύνδεση από όλες τις άλλες συσκευές;")) return;
		setBusy("sessions");
		try {
			const res = await apiCall("Authentication.revokeOtherSessions");
			toast.success("message" in res ? res.message : "Οι άλλες συσκευές αποσυνδέθηκαν");
			await loadSessions();
		} catch (error) {
			toast.error(errorText(error), { title: "Αποτυχία αποσύνδεσης συσκευών" });
		} finally {
			setBusy(null);
		}
	};

	return (
		<PanelPage title="Ο λογαριασμός μου">
			<Show when={user()} fallback={<p class={hintClass}>Φόρτωση…</p>}>
				{(me) => (
					<>
						<section class={`${cardClass} flex flex-wrap items-center gap-4 p-5 sm:p-6`}>
							<div class="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-red-100 text-2xl text-red-900 ring-4 ring-red-50 dark:bg-red-950 dark:text-red-200 dark:ring-black/30">
								<Show when={me().avatar_url} fallback={<i class="fa-solid fa-user" aria-hidden="true"></i>}>
									{(avatar) => <img src={avatar()} alt="" referrerPolicy="no-referrer" class="h-full w-full object-cover" />}
								</Show>
							</div>
							<div class="grid gap-1 min-w-0 flex-1">
								<p class="text-lg font-bold break-all">{me().email}</p>
								<p class={hintClass}>Συνδεθήκατε με {methodLabel(me().sessionMethod)}</p>
							</div>
							<Badge tone={me().role === "secretary" ? "neutral" : "success"}>{ROLE_LABELS[me().role]}</Badge>
						</section>

						<PanelCard
							icon="fa-solid fa-right-to-bracket"
							title="Τρόποι εισόδου"
							description="Συνδέστε λογαριασμούς για να μπαίνετε με ένα κλικ. Δεν χρειάζεται να έχουν το ίδιο email με τον λογαριασμό σας.">
							<ul class="grid gap-2">
								<li class="flex flex-wrap items-center gap-3 rounded-xl border border-red-900/10 dark:border-white/10 px-4 py-3">
									<span
										class="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-red-900 dark:bg-black/30 dark:text-red-200"
										aria-hidden="true">
										<i class="fa-solid fa-key"></i>
									</span>
									<div class="grid flex-1 min-w-[10rem]">
										<span class="font-bold">Email και κωδικός</span>
										<span class={hintClass}>{me().hasPassword ? "Ορισμένος κωδικός" : "Δεν έχει οριστεί κωδικός"}</span>
									</div>
									<Show when={me().hasPassword}>
										<Badge tone="success">Ενεργό</Badge>
									</Show>
									<button type="button" class={secondaryButtonClass} onClick={() => openPanel("account-password")}>
										{me().hasPassword ? "Αλλαγή" : "Ορισμός"}
									</button>
								</li>
								<For each={providerRows()}>
									{(row) => (
										<li class="flex flex-wrap items-center gap-3 rounded-xl border border-red-900/10 dark:border-white/10 px-4 py-3">
											<span
												class="grid h-9 w-9 place-items-center rounded-lg bg-[#fff] text-[#111] ring-1 ring-gray-200 dark:ring-0"
												aria-hidden="true"
												innerHTML={PROVIDER_ICONS[row.id] ?? ""}
											/>
											<div class="grid flex-1 min-w-[10rem]">
												<span class="font-bold">{row.label}</span>
												<Show when={row.identity} fallback={<span class={hintClass}>Δεν έχει συνδεθεί</span>}>
													{(identity) => (
														<span class={`${hintClass} break-all`}>
															{identity().email ?? "Συνδεδεμένος λογαριασμός"}
															{identity().last_used_at ? ` · τελευταία είσοδος ${dateTime(identity().last_used_at!)}` : ""}
														</span>
													)}
												</Show>
											</div>
											<Show
												when={row.identity}
												fallback={
													<button
														type="button"
														class={primaryButtonClass + " px-3 py-1.5 text-sm"}
														disabled={busy() !== null || !me().providers.some((p) => p.id === row.id)}
														onClick={() => connect(row.id)}>
														{busy() === `link:${row.id}` ? "Μεταφορά…" : "Σύνδεση"}
													</button>
												}>
												<Badge tone="success">Συνδεδεμένο</Badge>
												<button
													type="button"
													class={secondaryButtonClass}
													disabled={busy() !== null || signInMethods() <= 1}
													title={signInMethods() <= 1 ? "Είναι ο μοναδικός τρόπος εισόδου σας" : undefined}
													onClick={() => disconnect(row.id, row.label)}>
													{busy() === `unlink:${row.id}` ? "Αποσύνδεση…" : "Αποσύνδεση"}
												</button>
											</Show>
										</li>
									)}
								</For>
							</ul>
							<Show when={me().providers.length === 0}>
								<p class={hintClass}>Δεν έχει ενεργοποιηθεί κανένας πάροχος σύνδεσης σε αυτό το περιβάλλον.</p>
							</Show>
						</PanelCard>

						<PanelCollapsible
							id="account-password"
							icon="fa-solid fa-lock"
							title={me().hasPassword ? "Αλλαγή κωδικού" : "Ορισμός κωδικού"}
							description={me().hasPassword ? "Μετά την αλλαγή, οι άλλες συσκευές αποσυνδέονται." : "Για να συνδέεστε και με email και κωδικό."}>
							<form ref={passwordForm} class="grid gap-4" onSubmit={onPasswordSubmit}>
								{/* Lets password managers attach the new password to the right account. */}
								<input type="email" name="username" autocomplete="username" value={me().email} class="hidden" readOnly />
								<Show when={me().passwordChangeNeedsCurrent}>
									<label class="grid gap-1">
										<span class="text-sm font-bold">Τρέχων κωδικός</span>
										<input type="password" name="current_password" autocomplete="current-password" required class={inputClass} />
										<span class="text-xs text-gray-600 dark:text-gray-300">
											Δεν τον θυμάστε; Αποσυνδεθείτε και πατήστε «Ξεχάσατε τον κωδικό;» στη σελίδα εισόδου. Αν μόλις συνδεθήκατε (π.χ. με
											Google), μπορείτε για 10 λεπτά να ορίσετε νέο χωρίς αυτόν.
										</span>
									</label>
								</Show>
								<div class="grid gap-4 sm:grid-cols-2">
									<label class="grid gap-1 content-start">
										<span class="text-sm font-bold">Νέος κωδικός</span>
										<input type="password" name="new_password" autocomplete="new-password" minLength={8} required class={inputClass} />
										<span class="text-xs text-gray-600 dark:text-gray-300">Τουλάχιστον 8 χαρακτήρες.</span>
									</label>
									<label class="grid gap-1 content-start">
										<span class="text-sm font-bold">Επιβεβαίωση</span>
										<input type="password" name="confirm_password" autocomplete="new-password" minLength={8} required class={inputClass} />
									</label>
								</div>
								<Show when={passwordError()}>
									<p role="alert" class="text-sm text-red-700 dark:text-red-300">
										{passwordError()}
									</p>
								</Show>
								<button type="submit" class={primaryButtonClass} disabled={busy() !== null}>
									{busy() === "password" ? "Αποθήκευση…" : me().hasPassword ? "Αλλαγή κωδικού" : "Ορισμός κωδικού"}
								</button>
							</form>
						</PanelCollapsible>

						<PanelCollapsible
							id="account-sessions"
							icon="fa-solid fa-laptop"
							title="Συνδεδεμένες συσκευές"
							description="Κάθε σύνδεση ισχύει 7 ημέρες. Αποσυνδέστε όποια συσκευή δεν αναγνωρίζετε."
							badge={<Badge>{sessions().length}</Badge>}>
							<ul class="grid gap-2">
								<For each={sessions()} fallback={<li class={hintClass}>Φόρτωση…</li>}>
									{(session) => (
										<li class="flex flex-wrap items-center gap-3 rounded-xl border border-red-900/10 dark:border-white/10 px-4 py-3">
											<span
												class="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-red-900 dark:bg-black/30 dark:text-red-200"
												aria-hidden="true">
												<i
													class={`fa-solid ${/Android|iPhone|iPad/.test(session.user_agent ?? "") ? "fa-mobile-screen" : "fa-desktop"}`}></i>
											</span>
											<div class="grid flex-1 min-w-[10rem]">
												<span class="flex flex-wrap items-center gap-2 font-bold">
													{deviceLabel(session.user_agent)}
													<Show when={session.current}>
														<Badge tone="success">Αυτή η συσκευή</Badge>
													</Show>
												</span>
												<span class={hintClass}>
													{methodLabel(session.method)} · τελευταία δραστηριότητα {dateTime(session.last_seen_at)}
												</span>
											</div>
											<button
												type="button"
												class={secondaryButtonClass}
												disabled={busy() !== null}
												onClick={() => signOutSession(session)}>
												{busy() === `session:${session.id}` ? "Αποσύνδεση…" : "Αποσύνδεση"}
											</button>
										</li>
									)}
								</For>
							</ul>
							<Show when={sessions().length > 1}>
								<button type="button" class={primaryButtonClass} disabled={busy() !== null} onClick={signOutOthers}>
									<i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
									{busy() === "sessions" ? "Αποσύνδεση…" : "Αποσύνδεση από όλες τις άλλες συσκευές"}
								</button>
							</Show>
						</PanelCollapsible>
					</>
				)}
			</Show>
		</PanelPage>
	);
}
