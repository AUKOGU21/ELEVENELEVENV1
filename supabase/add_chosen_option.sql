-- Which option she went with on a two-option "deciding between" decision:
-- 'first' | 'second' | 'both' (null for single-item decisions or "neither").
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS chosen_option text;
