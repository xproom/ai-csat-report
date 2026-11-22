-- AI 검증 평가 서비스 · 교사 프로필과 관리자 승인 (schema.sql 다음에 한 번 실행, 여러 번 실행해도 안전)
--
-- 흐름
--   1) 처음 로그인하면 profiles에 '승인 대기(pending)' 행이 자동으로 생김
--   2) 교사는 이름·학교·과목을 적어 신청하고, 관리자가 '승인(approved)'하면 서비스를 쓸 수 있음
--   3) 평가지·풀이·문제지 파일은 '승인된 교사 본인 것'만 읽고 쓸 수 있음 (화면을 우회해도 서버가 막음)
-- 첫 관리자 지정 (이 파일 맨 아래 주석 참고) - 관리자 이메일은 공개 저장소에 적지 말고 SQL Editor에서만 실행

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  name text not null default '',
  school text not null default '',
  subject text not null default '',
  role text not null default 'teacher' check (role in ('admin', 'teacher')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid
);

alter table public.profiles enable row level security;

-- 승인·관리자 여부 (RLS 안에서 profiles를 다시 읽어도 막히지 않도록 security definer)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'approved')
$$;

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'approved')
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_approved() to authenticated;
grant select, insert, update on public.profiles to authenticated;
revoke all on public.profiles from anon;

drop policy if exists "본인·관리자 프로필 읽기" on public.profiles;
create policy "본인·관리자 프로필 읽기" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "본인 프로필 만들기" on public.profiles;
create policy "본인 프로필 만들기" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()) and role = 'teacher' and status = 'pending');

drop policy if exists "본인·관리자 프로필 고치기" on public.profiles;
create policy "본인·관리자 프로필 고치기" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

-- 교사가 자기 행을 고쳐도 권한·승인 상태는 바꿀 수 없게 (관리자만 바꿈)
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- 교사 본인 요청만 막음 (SQL Editor·서버 작업은 auth.uid()가 없어 허용 → 첫 관리자 지정 가능)
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.status := case when old.status = 'rejected' and new.status = 'pending' then 'pending' else old.status end;
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    new.email := old.email;
  end if;
  return new;
end
$$;

drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile before update on public.profiles
  for each row execute function public.protect_profile();

-- 처음 로그인(가입)하면 승인 대기 프로필을 자동으로 만듦
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이미 가입한 사용자도 프로필 만들기
insert into public.profiles (id, email)
select id, coalesce(email, '') from auth.users
on conflict (id) do nothing;

-- 평가지·풀이·문제지 파일: 승인된 교사 본인 것만
drop policy if exists "본인 평가지" on public.papers;
create policy "본인 평가지" on public.papers
  for all to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_approved()))
  with check (owner_id = (select auth.uid()) and (select public.is_approved()));

drop policy if exists "본인 풀이 기록" on public.runs;
create policy "본인 풀이 기록" on public.runs
  for all to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_approved()))
  with check (owner_id = (select auth.uid()) and (select public.is_approved()));

drop policy if exists "본인 문제지 파일" on public.paper_files;
create policy "본인 문제지 파일" on public.paper_files
  for all to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_approved()))
  with check (owner_id = (select auth.uid()) and (select public.is_approved()));

drop policy if exists "본인 폴더 읽기" on storage.objects;
create policy "본인 폴더 읽기" on storage.objects
  for select to authenticated
  using (bucket_id = 'paper-files' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_approved()));

drop policy if exists "본인 폴더 올리기" on storage.objects;
create policy "본인 폴더 올리기" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'paper-files' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_approved()));

drop policy if exists "본인 폴더 바꾸기" on storage.objects;
create policy "본인 폴더 바꾸기" on storage.objects
  for update to authenticated
  using (bucket_id = 'paper-files' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_approved()));

drop policy if exists "본인 폴더 지우기" on storage.objects;
create policy "본인 폴더 지우기" on storage.objects
  for delete to authenticated
  using (bucket_id = 'paper-files' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_approved()));

-- 첫 관리자 지정 (SQL Editor에서 이메일을 바꿔 한 번 실행)
-- update public.profiles set role = 'admin', status = 'approved', approved_at = now() where email = '관리자@example.com';
