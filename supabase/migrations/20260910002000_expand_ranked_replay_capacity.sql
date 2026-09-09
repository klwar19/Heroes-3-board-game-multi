-- Keep the terminal replay store aligned with the live PartyKit recorder.
alter table public.homm3bg_ranked_replays
  drop constraint if exists homm3bg_ranked_replays_byte_length_check;

alter table public.homm3bg_ranked_replays
  add constraint homm3bg_ranked_replays_byte_length_check
  check (byte_length >= 0 and byte_length <= 16000000);

alter table public.homm3bg_ranked_replays
  drop constraint if exists homm3bg_ranked_replays_action_count_check;

alter table public.homm3bg_ranked_replays
  add constraint homm3bg_ranked_replays_action_count_check
  check (action_count >= 0 and action_count <= 1000000);
