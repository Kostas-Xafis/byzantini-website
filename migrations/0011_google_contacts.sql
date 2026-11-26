-- «Επαφές Google» (lib/contacts/, lib/api/routes/googleContacts.ts): the school's Google account whose
-- contacts the admin keeps in sync with the pupil register through the People API.
--
-- One row at most (id = 1). `refresh_token` is AES-GCM ciphertext (key derived from SECRET,
-- lib/contacts/link.server.ts): a database dump alone cannot be used to read the school's contacts.
-- Rotating SECRET makes the stored token unreadable: the admin then connects the account again.
CREATE TABLE google_contacts_link (
	id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
	account_email TEXT NOT NULL,
	-- Google's stable account id ("sub" of the ID token).
	account_subject TEXT NOT NULL,
	refresh_token TEXT NOT NULL,
	connected_by TEXT NOT NULL,
	connected_at INTEGER NOT NULL,
	-- 'ok', or 'expired' once Google refused the refresh token (revoked, or the 7-day limit of an
	-- OAuth consent screen in "Testing"): the page then asks to connect again.
	status TEXT NOT NULL DEFAULT 'ok',
	last_sync_at INTEGER,
	last_sync_by TEXT,
	-- JSON: the counts of the last applied sync and the R2 key of the backup taken before it.
	last_sync_summary TEXT
);
