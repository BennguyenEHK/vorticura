-- Drop dead/redundant columns from supplier_item_status (2026-06-01).
--   source_tier:      always 0 (search tiers were removed) -> dead.
--   extraction_track: exact duplicate of extraction_confidence in every row -> redundant.
-- Retained: responded_at (written by the supplier email-respond flow, read by the
-- items-ordering panel) and match_reasoning (kept for substitute/alternative rows).
ALTER TABLE supplier_item_status DROP COLUMN IF EXISTS source_tier;
ALTER TABLE supplier_item_status DROP COLUMN IF EXISTS extraction_track;
