-- Prevents a custom/manually-set display name from being silently
-- overwritten by the Google profile name on the next sign-in/session
-- refresh. Set to 1 whenever a name is changed by the user (via
-- POST /api/me {action:'set_name'}) or manually via SQL.
ALTER TABLE users ADD COLUMN name_locked INTEGER NOT NULL DEFAULT 0;
