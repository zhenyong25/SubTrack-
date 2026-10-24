-- Savings goals and sinking funds. Run in Supabase SQL editor; safe to rerun.
begin;
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  kind text not null check (kind in ('Savings', 'Sinking fund')),
  target_amount numeric(18,2) not null check (target_amount > 0),
  opening_balance numeric(18,2) not null default 0 check (opening_balance >= 0),
  currency varchar(3) not null check (currency ~ '^[A-Z]{3}$'),
  target_date date,
  repeat_months integer not null default 0,
  color text not null default '#8b5cf6',
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check ((kind = 'Savings' and repeat_months = 0) or (kind = 'Sinking fund' and target_date is not null and repeat_months in (1,3,6,12)))
);
create table if not exists public.savings_goal_entries (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('Contribution', 'Withdrawal')),
  advanced_cycle boolean not null default false,
  amount numeric(18,2) not null check (amount > 0),
  entry_date date not null,
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.savings_goals(id, user_id) on delete cascade
);
alter table public.savings_goal_entries add column if not exists advanced_cycle boolean not null default false;
create index if not exists savings_goals_user_idx on public.savings_goals(user_id, created_at, id);
create index if not exists savings_goal_entries_user_idx on public.savings_goal_entries(user_id, created_at, id);
create index if not exists savings_goal_entries_goal_idx on public.savings_goal_entries(goal_id);
alter table public.savings_goals enable row level security;
alter table public.savings_goal_entries enable row level security;
revoke all on public.savings_goals, public.savings_goal_entries from anon, authenticated;
grant select, insert, update, delete on public.savings_goals to authenticated;
grant select on public.savings_goal_entries to authenticated;
grant all on public.savings_goals, public.savings_goal_entries to service_role;
drop policy if exists "Own savings goals" on public.savings_goals;
create policy "Own savings goals" on public.savings_goals for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Read own savings entries" on public.savings_goal_entries;
create policy "Read own savings entries" on public.savings_goal_entries for select to authenticated using (auth.uid() = user_id);

create or replace function public.touch_savings_goal() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists touch_savings_goal on public.savings_goals;
create trigger touch_savings_goal before update on public.savings_goals for each row execute function public.touch_savings_goal();

-- Entry mutations go through RPCs: balance checks, the movement, and the cycle change are atomic.
-- The goal row lock serializes simultaneous withdrawals on different devices.
create or replace function public.record_savings_goal_entry(
  p_goal_id uuid, p_entry_id uuid, p_direction text, p_amount numeric, p_entry_date date,
  p_notes text default null, p_advance_cycle boolean default false, p_today date default current_date
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_goal public.savings_goals%rowtype;
  v_existing public.savings_goal_entries%rowtype;
  v_balance numeric;
  v_next date;
  v_day integer;
  v_end boolean;
begin
  if v_user is null then raise exception 'Please sign in again.'; end if;
  select * into v_goal from public.savings_goals where id = p_goal_id and user_id = v_user for update;
  if not found then raise exception 'This goal is no longer available.'; end if;
  select * into v_existing from public.savings_goal_entries where id = p_entry_id;
  if found then
    if v_existing.user_id = v_user and v_existing.goal_id = p_goal_id and v_existing.direction = p_direction and v_existing.amount = p_amount and v_existing.entry_date = p_entry_date and coalesce(v_existing.notes,'') = coalesce(p_notes,'') and v_existing.advanced_cycle = p_advance_cycle then return; end if;
    raise exception 'This movement has already been recorded with different details.';
  end if;
  if p_direction is null or p_direction not in ('Contribution','Withdrawal') or p_amount is null or p_amount <= 0 or p_amount > 1000000000000 or p_amount <> round(p_amount,2) then raise exception 'Enter a valid amount with up to two decimal places.'; end if;
  if p_entry_date is null or p_today is null or p_entry_date > p_today then raise exception 'Choose today or an earlier date.'; end if;
  if char_length(coalesce(p_notes,'')) > 1000 then raise exception 'Keep notes within 1,000 characters.'; end if;
  if p_advance_cycle and (v_goal.kind <> 'Sinking fund' or p_direction <> 'Withdrawal') then raise exception 'Only a sinking-fund withdrawal can start a new cycle.'; end if;
  select v_goal.opening_balance + coalesce(sum(case when direction = 'Contribution' then amount else -amount end),0) into v_balance from public.savings_goal_entries where goal_id = p_goal_id and user_id = v_user;
  if p_direction = 'Withdrawal' and p_amount > v_balance then raise exception 'You cannot use more than the amount saved in this goal.'; end if;
  if p_direction = 'Contribution' and v_balance + p_amount > 1000000000000 then raise exception 'This contribution would exceed the supported goal balance.'; end if;
  insert into public.savings_goal_entries(id,goal_id,user_id,direction,amount,entry_date,notes,advanced_cycle) values(p_entry_id,p_goal_id,v_user,p_direction,p_amount,p_entry_date,p_notes,p_advance_cycle);
  if p_advance_cycle then
    v_next := v_goal.target_date;
    v_day := extract(day from v_next);
    v_end := v_next = (date_trunc('month', v_next) + interval '1 month' - interval '1 day')::date;
    loop
      v_next := (date_trunc('month', v_next) + make_interval(months => v_goal.repeat_months))::date;
      if v_end then v_next := (v_next + interval '1 month' - interval '1 day')::date;
      else v_next := v_next + least(v_day, extract(day from (v_next + interval '1 month' - interval '1 day')))::integer - 1; end if;
      exit when v_next > p_today;
    end loop;
    update public.savings_goals set target_date = v_next where id = p_goal_id and user_id = v_user;
  else
    update public.savings_goals set updated_at = now() where id = p_goal_id and user_id = v_user;
  end if;
end;
$$;
create or replace function public.delete_savings_goal_entry(p_goal_id uuid, p_entry_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_goal public.savings_goals%rowtype; v_balance numeric;
begin
  if v_user is null then raise exception 'Please sign in again.'; end if;
  select * into v_goal from public.savings_goals where id = p_goal_id and user_id = v_user for update;
  if not found then raise exception 'This goal is no longer available.'; end if;
  select v_goal.opening_balance + coalesce(sum(case when direction = 'Contribution' then amount else -amount end),0) into v_balance from public.savings_goal_entries where goal_id = p_goal_id and user_id = v_user and id <> p_entry_id;
  if v_balance < 0 then raise exception 'Removing this contribution would make the saved balance negative. Correct the related withdrawal first.'; end if;
  delete from public.savings_goal_entries where id = p_entry_id and goal_id = p_goal_id and user_id = v_user;
  update public.savings_goals set updated_at = now() where id = p_goal_id and user_id = v_user;
end;
$$;
revoke all on function public.record_savings_goal_entry(uuid,uuid,text,numeric,date,text,boolean,date) from public;
revoke all on function public.delete_savings_goal_entry(uuid,uuid) from public;
grant execute on function public.record_savings_goal_entry(uuid,uuid,text,numeric,date,text,boolean,date) to authenticated;
grant execute on function public.delete_savings_goal_entry(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
