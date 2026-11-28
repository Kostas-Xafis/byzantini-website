-- «Διέκοψε» and «Μετεγγραφή» on the pupil, so the secretariat no longer writes them into «Σημείωση ελέγχου».
-- stopped_year: the last school year the pupil attended before stopping ('2018-2019'); '' = not stopped. A new
--   enrollment in a later year clears it (the pupil came back).
-- transfer_year: the school year the pupil came to the school by transfer ('' = not a transfer);
-- transfer_from: the school they came from, when known.
-- Filled from the school's Excel register by scripts/registryStatus.ts.
ALTER TABLE pupils ADD COLUMN stopped_year TEXT NOT NULL DEFAULT '';
ALTER TABLE pupils ADD COLUMN transfer_year TEXT NOT NULL DEFAULT '';
ALTER TABLE pupils ADD COLUMN transfer_from TEXT NOT NULL DEFAULT '';
