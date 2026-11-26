-- A parent's answer, on the registration form, to whether a pupil under 18 may appear in the photos and videos
-- the school publishes from its public events (announcements, social media). Asked only for minors.
--   media_consent     NULL = not asked (adult, or registered before this question) · 1 = allowed · 0 = not allowed
--   media_consent_at  when the answer was given or last changed (ms), NULL while not asked
ALTER TABLE pupils ADD COLUMN media_consent INTEGER;
ALTER TABLE pupils ADD COLUMN media_consent_at INTEGER;
