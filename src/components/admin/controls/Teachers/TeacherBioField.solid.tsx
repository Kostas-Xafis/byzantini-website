import { createSignal, createUniqueId } from "solid-js";

/*
 * «Σύντομο βιογραφικό»: the public bio shown on the teacher's own page (/kathigites/<slug>/), rendered inside the
 * generic `Modal` through an `Input` of type "custom". The textarea is named `bio`, so `ExtendedFormData.string("bio")`
 * reads it like any other field; the word count is live.
 */

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export function TeacherBioField(props: { value?: string | null }) {
	const id = createUniqueId();
	const [words, setWords] = createSignal(countWords(props.value ?? ""));

	return (
		<div class="col-span-full grid gap-y-1 font-didact text-ink">
			<label for={`bio-${id}`} class="text-base">
				Σύντομο βιογραφικό
			</label>
			<textarea
				id={`bio-${id}`}
				name="bio"
				rows={8}
				aria-describedby={`bio-hint-${id}`}
				value={props.value ?? ""}
				onInput={(e) => setWords(countWords(e.currentTarget.value))}
				class="w-full resize-y rounded-md border-2 border-ink-muted bg-surface px-3 py-2 text-lg text-ink shadow-md shadow-shade focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
			/>
			<p id={`bio-hint-${id}`} class="flex flex-wrap justify-between gap-x-4 text-sm text-ink-muted">
				<span>Εμφανίζεται στη σελίδα του καθηγητή — 150 έως 200 λέξεις, μόνο επαγγελματικά στοιχεία.</span>
				<span aria-live="polite" class={words() > 200 ? "text-danger" : undefined}>
					{words()} λέξεις
				</span>
			</p>
		</div>
	);
}
