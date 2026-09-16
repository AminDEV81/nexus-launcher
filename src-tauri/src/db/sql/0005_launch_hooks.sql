-- Epic 11: optional shell commands run immediately before a game
-- starts and immediately after its process exits (e.g. toggling a
-- Discord Rich Presence helper, pausing a sync client). Both are
-- fire-and-forget from `launch_game`/the playtime tracker — a failing
-- hook never blocks the launch or the playtime it records.
ALTER TABLE games ADD COLUMN pre_launch_command  TEXT;
ALTER TABLE games ADD COLUMN post_launch_command TEXT;
