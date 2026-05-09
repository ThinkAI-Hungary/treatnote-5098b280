-- ============================================================
-- TreatNote V2 — Local SQLite Schema
-- Lokális DB fejlesztéshez és tesztekhez
-- Supabase-ből csak olvasunk (szotar_kezelesek)
-- ============================================================

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Atomi akciók katalógus
CREATE TABLE IF NOT EXISTS v2_atomic_actions (
  id TEXT PRIMARY KEY,                -- UUID
  slug TEXT UNIQUE NOT NULL,
  name_hu TEXT NOT NULL,
  category TEXT NOT NULL,
  parameter_schema TEXT NOT NULL,     -- JSON: ParameterDef[]
  default_params TEXT DEFAULT '{}',
  embedding_text TEXT,
  embedding TEXT,                     -- JSON: number[] (3072-dim)
  created_at TEXT DEFAULT (datetime('now'))
);

-- Protokoll-template-ek
CREATE TABLE IF NOT EXISTS v2_protocol_templates (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name_hu TEXT NOT NULL,
  category TEXT,                       -- konzervalo, szajsebeszet, implantacio, stb.
  triggers TEXT NOT NULL,             -- JSON: string[]
  atomic_actions TEXT NOT NULL,       -- JSON: string[] (slug-ok) — legacy, flat list
  visits TEXT,                        -- JSON: [{visit:1, name:"...", actions:["slug1"]}] — multi-visit
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Klinika-specifikus mapping: atomi akció → klinika szótár tétel
CREATE TABLE IF NOT EXISTS v2_clinic_mappings (
  id TEXT PRIMARY KEY,
  telephely_id TEXT NOT NULL,
  szotar_kezeles_id TEXT,             -- Supabase szotar_kezelesek FK (referenciális, nem enforced)
  szotar_kezeles_name TEXT,           -- klinika-tétel neve (denormalizálva)
  atomic_action_slug TEXT NOT NULL REFERENCES v2_atomic_actions(slug),
  conditions TEXT DEFAULT '{}',       -- JSON: feltételek (surface_count, material, stb.)
  confidence REAL,
  reviewed INTEGER DEFAULT 0,         -- 0=nem, 1=igen
  reviewed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Klinika default felülírások
CREATE TABLE IF NOT EXISTS v2_clinic_defaults (
  id TEXT PRIMARY KEY,
  telephely_id TEXT NOT NULL UNIQUE,
  overrides TEXT NOT NULL DEFAULT '{}', -- JSON: klinika-specifikus defaultok
  created_at TEXT DEFAULT (datetime('now'))
);

-- Klinika protokoll felülírások
CREATE TABLE IF NOT EXISTS v2_clinic_protocol_overrides (
  id TEXT PRIMARY KEY,
  telephely_id TEXT NOT NULL,
  template_slug TEXT NOT NULL REFERENCES v2_protocol_templates(slug),
  custom_actions TEXT NOT NULL,        -- JSON: custom atomi akció lista
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(telephely_id, template_slug)
);

-- Runtime: session (egy diktálás)
CREATE TABLE IF NOT EXISTS v2_sessions (
  id TEXT PRIMARY KEY,
  telephely_id TEXT NOT NULL,
  doctor_id TEXT,
  patient_ref TEXT,
  audio_url TEXT,
  transcript TEXT,
  llm_raw_response TEXT,              -- JSON: teljes AI válasz
  review_status TEXT DEFAULT 'pending_quick',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Runtime: protocol instance (session-en belül)
CREATE TABLE IF NOT EXISTS v2_protocol_instances (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES v2_sessions(id),
  template_slug TEXT,
  atomic_actions TEXT NOT NULL,        -- JSON: AtomicActionInstance[]
  parameters TEXT NOT NULL,            -- JSON: paraméterek
  confidences TEXT,                    -- JSON: konfidencia értékek
  mapped_items TEXT,                   -- JSON: mapping eredmény
  warnings TEXT,                       -- JSON: string[]
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_v2_actions_category ON v2_atomic_actions(category);
CREATE INDEX IF NOT EXISTS idx_v2_mappings_telephely ON v2_clinic_mappings(telephely_id);
CREATE INDEX IF NOT EXISTS idx_v2_mappings_action ON v2_clinic_mappings(atomic_action_slug);
CREATE INDEX IF NOT EXISTS idx_v2_sessions_telephely ON v2_sessions(telephely_id);
CREATE INDEX IF NOT EXISTS idx_v2_instances_session ON v2_protocol_instances(session_id);
