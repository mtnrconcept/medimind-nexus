create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create function auth.role() returns text
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

create table auth.users (
  id uuid primary key,
  email text
);

create table public.user_roles (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'doctor'
);

create table public.patients (
  id uuid primary key,
  patient_id text not null,
  age integer not null,
  gender text not null,
  nationality text not null
);
alter table public.patients enable row level security;
create policy "Authenticated users can view patients" on public.patients for select to authenticated using (true);
create policy "Admins can insert patients" on public.patients for insert to authenticated with check (false);
create policy "Admins can update patients" on public.patients for update to authenticated using (false);
create policy "Admins can delete patients" on public.patients for delete to authenticated using (false);

grant select, insert, update, delete on public.patients to authenticated;

create table public.patient_documents (
  id uuid primary key,
  patient_id uuid not null references public.patients(id) on delete cascade,
  file_name text not null,
  file_type text not null,
  file_path text not null,
  file_size integer not null,
  created_at timestamptz default now()
);
alter table public.patient_documents enable row level security;
create policy "Enable read access for authenticated users" on public.patient_documents for select to authenticated using (true);
create policy "Enable insert for authenticated users" on public.patient_documents for insert to authenticated with check (true);
create policy "Enable update for authenticated users" on public.patient_documents for update to authenticated using (true);
create policy "Enable delete for authenticated users" on public.patient_documents for delete to authenticated using (true);
grant select, insert, update, delete on public.patient_documents to authenticated;

create table public.patient_labs (
  id uuid primary key,
  patient_id uuid not null references public.patients(id) on delete cascade,
  result text
);
alter table public.patient_labs enable row level security;
create policy broad_patient_lab_read on public.patient_labs for select to authenticated using (true);
create policy broad_patient_lab_write on public.patient_labs for all to authenticated using (true) with check (true);
grant all on public.patient_labs to authenticated;

create table public.ai_analysis_jobs (
  id uuid primary key,
  public_token uuid not null,
  function_name text not null,
  analysis_mode text not null default 'full_analysis',
  status text not null default 'queued',
  progress_percentage integer not null default 0,
  request_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_analysis_jobs enable row level security;
grant select, insert, update, delete on public.ai_analysis_jobs to authenticated;

create table public.clinical_trials (
  id uuid primary key,
  nct_id text not null unique,
  title text not null,
  brief_summary text,
  status text,
  phase text,
  conditions text[],
  interventions jsonb,
  enrollment integer,
  start_date date,
  completion_date date,
  sponsor text,
  min_age text,
  max_age text,
  gender text,
  locations jsonb,
  last_updated timestamptz,
  fetched_at timestamptz
);
alter table public.clinical_trials enable row level security;
create policy "Read clinical_trials" on public.clinical_trials for select to public using (true);
create policy "Insert clinical_trials" on public.clinical_trials for insert to public with check (true);
create policy "Update clinical_trials" on public.clinical_trials for update to public using (true);
grant select, insert, update on public.clinical_trials to anon, authenticated;

create table storage.objects (
  id uuid primary key,
  bucket_id text not null,
  name text not null
);
alter table storage.objects enable row level security;
create policy "Allow authenticated reads" on storage.objects for select to authenticated using (bucket_id = 'patient-documents');
create policy "Allow authenticated uploads" on storage.objects for insert to authenticated with check (bucket_id = 'patient-documents');
create policy "Allow authenticated updates" on storage.objects for update to authenticated using (bucket_id = 'patient-documents');
create policy "Allow authenticated deletes" on storage.objects for delete to authenticated using (bucket_id = 'patient-documents');
grant select, insert, update, delete on storage.objects to authenticated;

create or replace function public.legacy_privileged_function()
returns integer
language sql
security definer
as $$ select 1 $$;
grant execute on function public.legacy_privileged_function() to public, anon, authenticated;

insert into auth.users(id,email) values
  ('11111111-1111-4111-8111-111111111111','one@example.test'),
  ('22222222-2222-4222-8222-222222222222','two@example.test');

insert into public.user_roles(id,user_id,role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','11111111-1111-4111-8111-111111111111','doctor'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','22222222-2222-4222-8222-222222222222','doctor');

insert into public.patients(id,patient_id,age,gender,nationality) values
  ('33333333-3333-4333-8333-333333333333','P1',40,'F','CH'),
  ('44444444-4444-4444-8444-444444444444','P2',50,'M','CH');
