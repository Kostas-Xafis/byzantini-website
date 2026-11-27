import { APIRequestError, apiCall, validationMessages } from "@hooks/apiCall";
import Icon from "@components/other/Icon.solid";
import { Show, createSignal } from "solid-js";

/**
 * «Δήλωση Ενδιαφέροντος» — the short public form for families thinking about the school (contact page; the home page's hero links to it):
 * name, email, phone and an optional question, posted to `InterestDeclarations.post`, which stores it and emails the
 * secretariat. The hidden `website` field is a honeypot (only bots fill it in).
 */

/** `page`: where the form sits, stored with the declaration. */
type Props = { page: "home" | "contact" };

const inputClass =
	"w-full rounded-lg border border-red-900/30 bg-white px-3 py-2 text-base text-red-950 placeholder:text-red-950/40 transition-colors focus:border-red-900 focus:outline-hidden focus:ring-2 focus:ring-red-900/20";
const labelClass = "grid gap-1 text-sm font-semibold text-red-950";

function describeError(err: unknown): string {
	if (!(err instanceof APIRequestError)) return "Δεν ήταν δυνατή η σύνδεση. Ελέγξτε τη σύνδεσή σας στο διαδίκτυο και δοκιμάστε ξανά.";
	if (err.status === 429) return err.message;
	if (err.envelope && err.status < 500) {
		const issues = validationMessages(err.details);
		if (issues.length) return issues.join(" · ");
		return "Ορισμένα στοιχεία δεν είναι έγκυρα. Ελέγξτε τα πεδία της φόρμας.";
	}
	return "Παρουσιάστηκε σφάλμα. Δοκιμάστε ξανά σε λίγο ή καλέστε τη Γραμματεία της Σχολής.";
}

export default function InterestForm(props: Props) {
	const [sending, setSending] = createSignal(false);
	const [sent, setSent] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const ids = (name: string) => `interest-${props.page}-${name}`;

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		if (!form.reportValidity()) return;
		const data = new FormData(form);
		const text = (name: string) => String(data.get(name) ?? "").trim();
		setError(null);
		setSending(true);
		try {
			await apiCall("InterestDeclarations.post", {
				RequestObject: {
					first_name: text("first_name"),
					last_name: text("last_name"),
					email: text("email"),
					phone: text("phone"),
					message: text("message"),
					page: props.page,
					website: text("website") || undefined,
				},
			});
			form.reset();
			setSent(true);
		} catch (err) {
			setError(describeError(err));
		} finally {
			setSending(false);
		}
	};

	return (
		<div class="w-full rounded-xl border-2 border-red-900 bg-white p-6 shadow-md shadow-gray-400 max-sm:p-4 font-didact">
			<Show
				when={!sent()}
				fallback={
					<div class="grid place-items-center gap-3 py-8 text-center" role="status">
						<Icon name="check-circle" class="text-4xl text-green-700" />
						<p class="text-xl font-bold font-anaktoria text-red-900">Ευχαριστούμε!</p>
						<p class="max-w-[48ch] text-base text-red-950/85">
							Η δήλωσή σας καταχωρήθηκε. Η Γραμματεία θα επικοινωνήσει μαζί σας σύντομα, στο τηλέφωνο ή στο email που δηλώσατε.
						</p>
						<button
							type="button"
							class="mt-2 text-sm font-semibold text-red-900 underline decoration-red-900/30 underline-offset-[3px] hover:decoration-red-900"
							onClick={() => setSent(false)}>
							Νέα δήλωση
						</button>
					</div>
				}>
				<form class="grid gap-4" onSubmit={submit} aria-label="Δήλωση ενδιαφέροντος">
					<div class="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
						<label class={labelClass} for={ids("first_name")}>
							Όνομα
							<input id={ids("first_name")} name="first_name" class={inputClass} required maxlength={80} autocomplete="given-name" />
						</label>
						<label class={labelClass} for={ids("last_name")}>
							Επώνυμο
							<input id={ids("last_name")} name="last_name" class={inputClass} required maxlength={80} autocomplete="family-name" />
						</label>
						<label class={labelClass} for={ids("email")}>
							Email
							<input id={ids("email")} name="email" type="email" class={inputClass} required maxlength={254} autocomplete="email" />
						</label>
						<label class={labelClass} for={ids("phone")}>
							Τηλέφωνο
							<input
								id={ids("phone")}
								name="phone"
								type="tel"
								class={inputClass}
								required
								minlength={10}
								maxlength={20}
								autocomplete="tel"
								inputmode="tel"
							/>
						</label>
					</div>
					<label class={labelClass} for={ids("message")}>
						<span>
							Η ερώτησή σας <span class="font-normal text-red-950/60">(προαιρετικό)</span>
						</span>
						<textarea
							id={ids("message")}
							name="message"
							rows={4}
							maxlength={2000}
							class={`${inputClass} resize-y`}
							placeholder="Π.χ. ποιο τμήμα ταιριάζει σε ένα παιδί 8 ετών, ημέρες και ώρες μαθημάτων, δίδακτρα…"
						/>
					</label>
					{/* Honeypot: hidden from people and screen readers; bots fill in every field. */}
					<div class="sr-only" aria-hidden="true">
						<label>
							Ιστοσελίδα
							<input name="website" tabindex="-1" autocomplete="off" />
						</label>
					</div>
					<Show when={error()}>
						<p class="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
							<Icon name="alert-circle" class="mt-0.5 shrink-0" />
							{error()}
						</p>
					</Show>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<p class="text-xs text-red-950/70 max-w-[52ch]">
							Τα στοιχεία σας χρησιμοποιούνται μόνο για να επικοινωνήσουμε μαζί σας.{" "}
							<a href="/politiki-aporritou/#dilosi-endiaferontos" class="underline underline-offset-2 hover:text-red-900">
								Πολιτική Απορρήτου
							</a>
						</p>
						<button
							type="submit"
							disabled={sending()}
							class="inline-flex items-center gap-2 rounded-full bg-red-900 px-6 py-2.5 font-semibold text-red-50 shadow-md transition-colors hover:bg-red-950 disabled:opacity-60">
							<Icon name={sending() ? "spinner" : "send"} spin={sending()} />
							{sending() ? "Αποστολή…" : "Αποστολή"}
						</button>
					</div>
				</form>
			</Show>
		</div>
	);
}
