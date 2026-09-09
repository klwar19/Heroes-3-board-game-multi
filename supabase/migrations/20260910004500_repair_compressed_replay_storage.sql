-- Align existing production tables with the compressed replay writer.
alter table public.homm3bg_ranked_replays
  add column if not exists payload_gzip_base64 text;
alter table public.homm3bg_ranked_replays
  alter column payload drop not null;
alter table public.homm3bg_ranked_replays
  drop constraint if exists homm3bg_ranked_replays_payload_present_check;
alter table public.homm3bg_ranked_replays
  add constraint homm3bg_ranked_replays_payload_present_check
  check (payload is not null or payload_gzip_base64 is not null);
