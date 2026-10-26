CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',        -- 'user' | 'admin'
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE link_seq START 100000;      -- avoids very short generated codes

CREATE TABLE links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id BIGINT UNIQUE,
  owner_id UUID NOT NULL REFERENCES users(id),
  short_code TEXT NOT NULL UNIQUE,
  destination_url TEXT NOT NULL,
  title TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  blocked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON links (owner_id, created_at DESC);

CREATE TABLE click_events (
  event_id UUID PRIMARY KEY,                -- unique => dedup
  link_id UUID NOT NULL REFERENCES links(id),
  occurred_at TIMESTAMPTZ NOT NULL,
  country TEXT, device TEXT, browser TEXT, os TEXT,
  referrer_host TEXT, visitor_hash TEXT,
  bot_classification TEXT DEFAULT 'unknown'
);
CREATE INDEX ON click_events (link_id, occurred_at);

CREATE TABLE click_aggregates (
  link_id UUID NOT NULL,
  bucket_start TIMESTAMPTZ NOT NULL,
  granularity TEXT NOT NULL,                -- 'hour'
  dimension_type TEXT NOT NULL,             -- 'total'|'country'|'device'|'browser'|'referrer'
  dimension_value TEXT NOT NULL,
  count BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (link_id, bucket_start, granularity, dimension_type, dimension_value)
);

CREATE TABLE abuse_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID REFERENCES links(id),
  reason TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor UUID, action TEXT, target TEXT, meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);