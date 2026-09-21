-- 21 Sep 2026 prod E2E follow-up (findings 4 and 7).
-- 1) Pin search_path on xplay_is_privileged (Supabase linter: function_search_path_mutable).
alter function public.xplay_is_privileged() set search_path = public, pg_temp;

-- 2) notifications.is_read is an unused duplicate of notifications.read:
--    no app code, function, policy, view, index or edge function references it,
--    and every row that differed was read = true / is_read = false.
alter table public.notifications drop column if exists is_read;
