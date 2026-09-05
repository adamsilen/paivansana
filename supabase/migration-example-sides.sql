-- päivän sana — per-side example/info fields
alter table public.words add column if not exists example_sv text;
alter table public.words add column if not exists example_fi text;
-- migrate existing single example (was shown on the Swedish side)
update public.words set example_sv = example where example is not null and example_sv is null;
alter table public.words drop column if exists example;
