-- Drop the redundant supplier_search summary table (2026-06-02).
--   Its columns (subject, search_content, search_status, search_telemetry) were all
--   derivable in-memory from supplier_item_status rows, so the table added no value.
-- The search ENGINE and the per-item supplier_item_status results table are unchanged;
-- the Suppliers panel now renders directly from supplier_item_status.
-- CASCADE drops the FK from supplier_search -> rfq_analysis along with the table.
DROP TABLE IF EXISTS supplier_search CASCADE;
