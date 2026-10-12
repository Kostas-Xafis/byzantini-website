-- Admin invites are bound to the invited email and consumed on first use
-- (lib/api/routes/sysusers.ts → consumeRegisterLink).
ALTER TABLE sys_user_register_links ADD COLUMN email TEXT;

-- Links issued before this migration carry no email and can no longer be used.
DELETE FROM sys_user_register_links WHERE email IS NULL;

-- One admin account per email (case-insensitive): owner rights are granted by email.
-- Before applying remotely, check for duplicates:
--   SELECT lower(email), COUNT(*) FROM sys_users GROUP BY lower(email) HAVING COUNT(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS sys_users_email_unique ON sys_users (email COLLATE NOCASE);

-- Past logins/signups stored session ids and password hashes in query_logs (now redacted at write time).
UPDATE query_logs SET args = '"[redacted]"' WHERE query LIKE '%sys_users%' AND args <> '"[redacted]"';
