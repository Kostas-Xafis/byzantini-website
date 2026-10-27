# Teacher bios — how to write one for a new teacher

Every visible teacher has a public page at `/kathigites/<slug>/` (`src/pages/kathigites/[slug].astro`).
Its main text is `teachers.bio`: a **short professional summary of the teacher's CV**. Without it the page
shows only a generated one-line fallback («Ο … διδάσκει στη Σχολή ως …»), which is thin for Google and for
families. This file is the brief for whoever (person or agent) writes the bio of a new teacher.

## The owner's rules (non-negotiable)

- **Never publish the whole CV.** The bio is an excerpt/summary of **150–200 words**. The full CV stays a
  separate PDF download.
- **Professional facts only**, and only facts that are **in the CV**. Include:
  musical studies and schools, degrees and diplomas (with grade and year if given), the teachers they studied
  with, posts (ψάλτης, πρωτοψάλτης, λαμπαδάριος, χοράρχης, καθηγητής, …) with places and years, teaching
  experience, ensembles and choirs, concerts and notable venues, recordings, publications, awards, theology
  or musicology degrees, and their teaching at the Σχολή.
- **Exclude** everything personal or irrelevant: date or place of birth, age, family / marital status,
  home address, phone numbers, emails, social links, ID / ΑΜΚΑ / ΑΦΜ, military service, health, hobbies,
  languages and IT skills, non-music jobs (banking, medicine, engineering, civil service, …) and political
  office. A priest's parish appointment is fine as a position («υπηρετεί ως εφημέριος στον …»).
- **No invention, no embellishment.** No superlatives the CV doesn't use, no guessed dates, no facts from
  elsewhere. If the CV has too little professional content for 150 words, write what is there (shorter is
  fine) and tell the owner — a bio under ~100 words is worth asking the teacher to improve.

## Style

- Modern **monotonic** Greek, third person, plain and warm; one paragraph is fine (a newline in the text
  starts a new paragraph on the page).
- Open with the name exactly as on the site, with the article: «Ο Ιωάννης Τούσιας …», «Η Ζωή Μήλιου …»;
  for priests the CV's title: «Ο πρωτοπρεσβύτερος …».
- Order: studies and teachers → posts and teaching → ensembles, concerts, recordings, publications →
  their work at the Σχολή.
- The first sentence doubles as the page's meta description (cut at ~155 characters), so make it say who
  they are musically.
- A good example: `scripts/data/teacherBios.json`, id 12 (Ιωάννης Τούσιας), 179 words.

## Steps (agent)

1. **Get the teacher's row**: `id`, `fullname` (exactly, spaces included) and `cv` file name. The local dev DB
   may be older than production — if the teacher isn't there, ask the owner for the id and name from the
   admin «Καθηγητές» table. Never query production yourself.
2. **Get the CV PDF**: from the local dev server
   `http://localhost:4321/kathigites/cv/<encodeURIComponent(cv)>`, or — the CVs are public — from
   `https://musicschool-metamorfosi.gr/kathigites/cv/<encodeURIComponent(cv)>`. Save it in a scratch
   directory, not in the repo.
3. **Extract the text**: `pdftotext -layout cv.pdf -`. If that returns nothing or garbage (a scanned or
   badly encoded PDF), OCR it: `pdftoppm -r 300 -png cv.pdf page` then `tesseract page-1.png - -l ell` per
   page, and check names and dates against the page image.
4. **Write the bio** following the rules above.
5. **Add it** to `scripts/data/teacherBios.json` as `{ "id", "fullname", "bio", "words" }` (keep the array
   sorted as it is; `words` is the word count).
6. **Check and load it locally**:
   ```bash
   bun scripts/teacherBios.ts --only <id>            # dry run: word count, what would change
   bun scripts/teacherBios.ts --only <id> --apply    # write it to the LOCAL D1
   ```
   Then open `/kathigites/<slug>/` (slug = `slugify(fullname)` from `lib/utilities/slug.ts`, e.g.
   «Σωκράτης Χάρης» → `sokratis-charis`) and read it on the page.
7. **Production is the owner's step.** Write the SQL file and hand over the command — never run anything
   with `--remote` yourself:
   ```bash
   bun scripts/teacherBios.ts --only <id> --remote-sql /tmp/teacherBios.new.sql
   bunx wrangler d1 execute DB --remote --file /tmp/teacherBios.new.sql   # the owner runs this
   ```
   The statement matches `id` **and** `fullname` and only fills an **empty** bio, so it can never replace a
   text the secretaries already wrote or edited in the admin (`--force` overrides that — only on the
   owner's request).

## The shortcut without an agent

An admin can paste the text straight into **«Σύντομο βιογραφικό»** when adding or editing the teacher in the
dashboard (`TeacherBioField.solid.tsx`, with a live word count). It goes live immediately — no deploy, no
SQL. The same rules apply. (`teacherBios.json` is then simply out of date for that teacher, which is fine:
production is the source of truth; the JSON is the record of what was loaded by script.)

## Report back to the owner

- the teacher, the word count, and the bio text itself (so they can approve it before production);
- anything excluded that they might ask about, in general terms («ημερομηνία γέννησης, τηλέφωνα»);
- if the bio is under ~100 words, that the CV is thin and the teacher could send a fuller one;
- if the teacher is hidden (`visible = 0`) or has no CV: a hidden teacher has no page at all; a teacher
  without a CV needs the text from the owner or the teacher.
