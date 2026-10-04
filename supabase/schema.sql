-- Fluxo: sincronização entre aparelhos.
-- Rode este arquivo uma vez em: Supabase → SQL Editor → New query → Run.

create table if not exists public.records (
  user_id    uuid    not null default auth.uid() references auth.users on delete cascade,
  tbl        text    not null,
  id         text    not null,
  data       jsonb,
  deleted    boolean not null default false,
  updated_at bigint  not null,                          -- carimbo do aparelho (ms): vence o mais recente
  server_at  timestamptz not null default clock_timestamp(), -- ordem de chegada: cursor de leitura
  primary key (user_id, tbl, id)
);

create index if not exists records_user_server_at on public.records (user_id, server_at);

-- Cada pessoa só enxerga e altera os próprios dados.
alter table public.records enable row level security;
drop policy if exists "dono le e escreve" on public.records;
create policy "dono le e escreve" on public.records
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Grava em lote; em conflito só aceita a versão mais nova (last-write-wins).
create or replace function public.push_records(records jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.records (user_id, tbl, id, data, deleted, updated_at)
  select auth.uid(), r->>'tbl', r->>'id', r->'data', coalesce((r->>'deleted')::boolean, false), (r->>'updated_at')::bigint
  from jsonb_array_elements(records) as r
  on conflict (user_id, tbl, id) do update
    set data = excluded.data,
        deleted = excluded.deleted,
        updated_at = excluded.updated_at,
        server_at = clock_timestamp()
    where public.records.updated_at < excluded.updated_at;
$$;

revoke all on function public.push_records(jsonb) from public, anon;
grant execute on function public.push_records(jsonb) to authenticated;

-- Atualização em tempo real (celular ↔ computador em segundos).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records'
  ) then
    alter publication supabase_realtime add table public.records;
  end if;
end $$;
