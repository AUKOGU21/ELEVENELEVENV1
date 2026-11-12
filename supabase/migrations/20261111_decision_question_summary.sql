-- The short question on each feed card ("Are these worth $325?").
-- Run in the Supabase SQL Editor BEFORE deploying the frontend that reads it.
alter table public.decisions add column if not exists question_summary text;
alter table public.decisions add column if not exists question_summary_edited boolean not null default false;
comment on column public.decisions.question_summary is 'Short AI-written question for the feed card. Original text stays in uncertainty_text/context_note.';
comment on column public.decisions.question_summary_edited is 'True once she edits the card question herself; the AI never overwrites it after that.';
