-- Private bucket for all trip documents (tickets, receipts, hotel
-- confirmations, chat attachments). There are NO storage.objects policies for
-- the anon/authenticated roles, so the bucket is unreachable from the browser
-- except through short-lived signed URLs minted by the `files` Edge Function
-- using the service-role key (which never leaves the server).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trip-files',
  'trip-files',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Defensive: make sure no permissive policies exist for this bucket.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (qual ilike '%trip-files%' or with_check ilike '%trip-files%')
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;
