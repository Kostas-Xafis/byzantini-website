-- Short public biography per teacher, shown on the teacher's own page (/kathigites/<slug>/).
-- An excerpt of professional facts (150-200 words), never the whole CV.
ALTER TABLE teachers ADD COLUMN bio TEXT;
