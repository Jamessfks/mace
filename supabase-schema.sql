-- =========================================================================
-- MACE Community Calculation Database — Supabase Schema
-- =========================================================================
--
-- Run this SQL in the Supabase SQL Editor to create the table.
-- https://supabase.com/dashboard → SQL Editor → New Query → Paste → Run
--
-- Schema design follows conventions from:
--   - Materials Project (structure metadata, energy, forces)
--   - NOMAD (hierarchical method/system/calculation separation)
--   - AFLOW (standardized field naming for interoperability)
--
-- SCOPE: Currently records calculations from the General Calculator
-- (/calculate) only. Semiconductor page will be added in a future release.
-- =========================================================================

-- ── Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS calculations (
  -- Primary key & timestamp
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── Structure metadata ──
  formula         TEXT NOT NULL,           -- e.g. "C2H6O", "Si8"
  elements        TEXT[] NOT NULL,         -- e.g. {"C","H","O"}
  atom_count      INT NOT NULL,            -- total atoms in structure
  filename        TEXT NOT NULL,           -- original uploaded filename
  file_format     TEXT NOT NULL,           -- "xyz", "cif", "poscar", "pdb"

  -- ── Calculation parameters ──
  model_type      TEXT NOT NULL,           -- "MACE-MP-0" or "MACE-OFF"
  model_size      TEXT NOT NULL DEFAULT 'small',  -- "small", "medium", "large"
  calc_type       TEXT NOT NULL,           -- "single-point", "geometry-opt", "molecular-dynamics"
  dispersion      BOOLEAN NOT NULL DEFAULT false,

  -- ── Computed results ──
  energy_ev           DOUBLE PRECISION,    -- total energy (eV)
  energy_per_atom_ev  DOUBLE PRECISION,    -- energy / atom_count (eV)
  rms_force_ev_a      DOUBLE PRECISION,    -- RMS force (eV/Å)
  max_force_ev_a      DOUBLE PRECISION,    -- max force (eV/Å)
  volume_a3           DOUBLE PRECISION,    -- cell volume (ų), NULL if non-periodic
  calc_time_s         DOUBLE PRECISION,    -- wall time (seconds)

  -- ── MD-specific (nullable) ──
  md_steps        INT,                     -- number of MD steps
  md_ensemble     TEXT,                    -- "NVE", "NVT", "NPT"
  md_temperature_k DOUBLE PRECISION,       -- temperature (K)

  -- ── Contributor metadata ──
  contributor     TEXT NOT NULL DEFAULT 'Anonymous',
  institution     TEXT,                    -- optional affiliation
  notes           TEXT,                    -- free-text notes
  is_public       BOOLEAN NOT NULL DEFAULT true
);

-- ── Indexes for fast querying ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_calc_formula     ON calculations (formula);
CREATE INDEX IF NOT EXISTS idx_calc_type        ON calculations (calc_type);
CREATE INDEX IF NOT EXISTS idx_calc_model       ON calculations (model_type);
CREATE INDEX IF NOT EXISTS idx_calc_institution ON calculations (institution);
CREATE INDEX IF NOT EXISTS idx_calc_created     ON calculations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_public      ON calculations (is_public);

-- ── Row Level Security ────────────────────────────────────────────────────
-- Public read access for is_public=true rows, anyone can insert.
-- Future: add auth for update/delete of own rows.

ALTER TABLE calculations ENABLE ROW LEVEL SECURITY;

-- Anyone can read public records
CREATE POLICY "Public read access"
  ON calculations FOR SELECT
  USING (is_public = true);

-- Anyone can insert (anonymous sharing via anon key)
CREATE POLICY "Anonymous insert access"
  ON calculations FOR INSERT
  WITH CHECK (true);

-- =========================================================================
-- To verify after running:
--   SELECT COUNT(*) FROM calculations;   -- should return 0
-- =========================================================================
