-- AI 내신 성적표 · Supabase 스키마
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 한 번 실행하세요. (여러 번 실행해도 안전)
--
-- 구성
--   papers       평가지 (표지 옵션·문항 구성·정답·검증 결과를 data(jsonb)에 통째로 저장)
--   runs         AI 풀이·채점 기록
--   paper_files  문제지 파일 목록 (파일 본문은 Storage 버킷 paper-files에 저장)
-- 보안
--   모든 표에 행 수준 보안(RLS)을 켜고, 로그인한 교사 본인(owner_id = auth.uid())의 자료만 읽고 쓸 수 있게 합니다.
--   Storage도 "<사용자 ID>/..." 폴더 아래 본인 파일만 다룰 수 있습니다.
--   Anthropic API 키는 서버에 저장하지 않습니다 (각 교사의 브라우저에만 보관).

create table if not exists public.papers (
  id text primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.runs (
  id text primary key,
  paper_id text not null references public.papers (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.paper_files (
  id text primary key,
  paper_id text not null references public.papers (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  type text not null,
  size bigint not null default 0,
  ord integer not null default 0,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists papers_owner_idx on public.papers (owner_id, updated_at desc);
create index if not exists runs_owner_idx on public.runs (owner_id, paper_id);
create index if not exists paper_files_paper_idx on public.paper_files (paper_id, ord);

alter table public.papers enable row level security;
alter table public.runs enable row level security;
alter table public.paper_files enable row level security;

drop policy if exists "본인 평가지" on public.papers;
create policy "본인 평가지" on public.papers
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "본인 풀이 기록" on public.runs;
create policy "본인 풀이 기록" on public.runs
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "본인 문제지 파일" on public.paper_files;
create policy "본인 문제지 파일" on public.paper_files
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- 문제지 파일 버킷 (비공개, 파일당 50MB까지)
insert into storage.buckets (id, name, public, file_size_limit)
values ('paper-files', 'paper-files', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "본인 폴더 읽기" on storage.objects;
create policy "본인 폴더 읽기" on storage.objects
  for select to authenticated
  using (bucket_id = 'paper-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "본인 폴더 올리기" on storage.objects;
create policy "본인 폴더 올리기" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'paper-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "본인 폴더 바꾸기" on storage.objects;
create policy "본인 폴더 바꾸기" on storage.objects
  for update to authenticated
  using (bucket_id = 'paper-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "본인 폴더 지우기" on storage.objects;
create policy "본인 폴더 지우기" on storage.objects
  for delete to authenticated
  using (bucket_id = 'paper-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
