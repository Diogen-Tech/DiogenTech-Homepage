-- ============================================================
-- BloodLink – Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── Sessions table ────────────────────────────────────────────
-- Stores per-user conversation state for the WhatsApp bot.
create table if not exists sessions (
  phone      text primary key,          -- WhatsApp phone (e.g. "8801711234567")
  state      text not null default 'IDLE',
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ── Donors table ──────────────────────────────────────────────
-- One row per registered donor. Upserted on re-registration.
create table if not exists donors (
  phone             text primary key,
  blood_group       text not null,               -- "A+", "O-", etc.
  last_donated_days integer not null,            -- value selected by user
  last_donated_date date not null,               -- computed: now() - last_donated_days
  latitude          numeric(10, 7),
  longitude         numeric(11, 7),
  updated_at        timestamptz not null default now()
);

-- Index for fast blood-group + date eligibility queries
create index if not exists idx_donors_blood_date
  on donors (blood_group, last_donated_date);

-- ── Row Level Security (optional but recommended) ─────────────
-- The serverless function uses the service-role key and bypasses RLS.
-- Enable RLS and allow only the service-role to read/write.
alter table sessions enable row level security;
alter table donors   enable row level security;

-- Allow the service role to do everything (functions use this key)
create policy "service role full access – sessions"
  on sessions for all
  using (auth.role() = 'service_role');

create policy "service role full access – donors"
  on donors for all
  using (auth.role() = 'service_role');
