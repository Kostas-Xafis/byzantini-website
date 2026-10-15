-- Admin sign-in: several sessions per admin and several sign-in providers per admin
-- (lib/auth/sessions.ts, lib/auth/providers.ts, lib/api/routes/authentication.ts).

-- One row per signed-in device. `id` is the SHA-256 of the session cookie value:
-- the cookie itself is never stored, so a database dump cannot be replayed as a login.
CREATE TABLE sys_user_sessions (
	id TEXT PRIMARY KEY NOT NULL,
	user_id INTEGER NOT NULL,
	-- How the session was opened: 'password' or a provider id ('google', 'apple', 'microsoft').
	method TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	last_seen_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	user_agent TEXT
);
CREATE INDEX sys_user_sessions_user ON sys_user_sessions (user_id);

-- External accounts connected to an admin. Sign-in matches on (provider, subject) — the
-- provider's stable account id — never on the email the provider reports.
CREATE TABLE sys_user_identities (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	provider TEXT NOT NULL,
	subject TEXT NOT NULL,
	email TEXT,
	avatar_url TEXT,
	created_at INTEGER NOT NULL,
	last_used_at INTEGER
);
CREATE UNIQUE INDEX sys_user_identities_subject ON sys_user_identities (provider, subject);
-- One account per provider per admin.
CREATE UNIQUE INDEX sys_user_identities_user_provider ON sys_user_identities (user_id, provider);

-- Before 0008, Google sign-in matched admins by email. Until an admin connects (or disconnects) a Google
-- account explicitly, their first Google sign-in with that verified email adopts the account once
-- (lib/api/routes/authentication.ts). Admins created from now on start at 0.
ALTER TABLE sys_users ADD COLUMN google_email_match INTEGER NOT NULL DEFAULT 1;

-- Sessions moved to sys_user_sessions. Every admin signs in once more after this migration.
ALTER TABLE sys_users DROP COLUMN session_id;
ALTER TABLE sys_users DROP COLUMN session_exp_date;

-- `password` = '' now means "no password set" (accounts created through a provider).
