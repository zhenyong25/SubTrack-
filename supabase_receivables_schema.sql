-- Money owed to you. Run in the same Supabase project used by SubTrack.
-- Existing personal loans are unchanged. Safe to rerun.
create table if not exists public.receivables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  borrower text not null check (length(trim(borrower)) > 0),
  description text not null check (length(trim(description)) > 0),
  currency text not null,
  principal numeric(14,2) not null check (principal > 0),
  agreed_interest numeric(14,2) not null default 0 check (agreed_interest >= 0),
  lent_date date not null,
  due_date date check (due_date is null or due_date >= lent_date),
  repayment_plan text not null default 'One-off' check (repayment_plan in ('One-off', 'Instalments')),
  instalment numeric(14,2) check (instalment is null or instalment > 0),
  contact text, notes text,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  check (repayment_plan <> 'Instalments' or instalment is not null)
);
create table if not exists public.receivable_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receivable_id uuid not null,
  kind text not null check (kind in ('Repayment', 'Write-off')),
  entry_date date not null,
  principal numeric(14,2) not null default 0 check (principal >= 0),
  interest numeric(14,2) not null default 0 check (interest >= 0),
  notes text,
  created_at timestamptz not null default now(),
  foreign key (user_id, receivable_id) references public.receivables(user_id, id) on delete cascade,
  check (principal + interest > 0),
  check (kind <> 'Write-off' or length(trim(coalesce(notes, ''))) > 0)
);
create index if not exists receivables_owner_idx on public.receivables(user_id);
create index if not exists receivable_entries_owner_record_idx on public.receivable_entries(user_id, receivable_id, entry_date);
alter table public.receivables enable row level security;
alter table public.receivable_entries enable row level security;
drop policy if exists "Own receivables" on public.receivables;
create policy "Own receivables" on public.receivables for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Own receivable entries" on public.receivable_entries;
create policy "Own receivable entries" on public.receivable_entries for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.receivables to authenticated;
-- Entries are immutable: remove an erroneous entry and record a corrected one.
revoke update on public.receivable_entries from authenticated;
grant select, insert, delete on public.receivable_entries to authenticated;

-- Serialize entries against a parent lock so two simultaneous repayments cannot overcollect.
create or replace function public.guard_receivable_entry()
returns trigger language plpgsql set search_path = public as $$
declare parent public.receivables; paid_principal numeric; paid_interest numeric;
begin
  select * into parent from public.receivables where id = new.receivable_id and user_id = new.user_id for update;
  if not found then raise exception 'Receivable not found.'; end if;
  if new.entry_date < parent.lent_date or new.entry_date > (now() at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Entry date must be between the lent date and today.';
  end if;
  select coalesce(sum(principal), 0), coalesce(sum(interest), 0) into paid_principal, paid_interest from public.receivable_entries where receivable_id = parent.id and user_id = new.user_id;
  if paid_principal + new.principal > parent.principal or paid_interest + new.interest > parent.agreed_interest then
    raise exception 'Entry exceeds the outstanding principal or interest. Refresh and try again.';
  end if;
  return new;
end $$;
drop trigger if exists guard_receivable_entry on public.receivable_entries;
create trigger guard_receivable_entry before insert on public.receivable_entries for each row execute function public.guard_receivable_entry();

create or replace function public.guard_receivable_edit()
returns trigger language plpgsql set search_path = public as $$
declare paid_principal numeric; paid_interest numeric; count_entries bigint;
begin
  if new.lent_date > (now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'Date lent cannot be in the future.'; end if;
  if tg_op = 'UPDATE' then
    select coalesce(sum(principal),0), coalesce(sum(interest),0), count(*) into paid_principal, paid_interest, count_entries from public.receivable_entries where receivable_id = old.id and user_id = old.user_id;
    if new.principal < paid_principal or new.agreed_interest < paid_interest then raise exception 'Agreed amounts cannot be lower than recorded repayments and write-offs.'; end if;
    if count_entries > 0 and (new.currency <> old.currency or new.lent_date <> old.lent_date) then raise exception 'Currency and lent date cannot change after entries are recorded.'; end if;
    if new.id <> old.id or new.user_id <> old.user_id then raise exception 'Record identity cannot change.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_receivable_edit on public.receivables;
create trigger guard_receivable_edit before insert or update on public.receivables for each row execute function public.guard_receivable_edit();
notify pgrst, 'reload schema';
