-- «Δήλωση Ενδιαφέροντος»: a family that is thinking about the school leaves a name, an email, a phone and an
-- optional question (public form on the home and contact pages, route InterestDeclarations.post). The secretariat
-- gets an email per submission and reads / deletes them in the admin page «Δηλώσεις ενδιαφέροντος»; a row that is
-- still here is one nobody has dealt with yet (the «Αρχική» dashboard counts them).
CREATE TABLE interest_declarations (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	first_name TEXT NOT NULL,
	last_name TEXT NOT NULL,
	email TEXT NOT NULL,
	phone TEXT NOT NULL,
	message TEXT NOT NULL DEFAULT '',
	-- Where the form was filled in: 'home' | 'contact'.
	page TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL
);
CREATE INDEX interest_declarations_created_at ON interest_declarations (created_at);
