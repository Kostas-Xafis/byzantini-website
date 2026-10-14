-- Byzantine class years were stored as "Α' Ετος", "Β' Ετος Διπλώματος", ... without the tonos.
-- lib/classYears.ts now lists "Έτος"; the public form validates class_year against that list, so the stored
-- values are rewritten to match. REPLACE is case-sensitive and only touches the misspelt word.
UPDATE pupil_enrollments SET class_year = REPLACE(class_year, 'Ετος', 'Έτος') WHERE class_year LIKE '%Ετος%';
