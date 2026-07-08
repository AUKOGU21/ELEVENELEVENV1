-- Optional product link on a weigh-in/response, so responders can point the
-- poster to an alternative product without pasting a raw URL into their take.
ALTER TABLE responses ADD COLUMN IF NOT EXISTS product_url text;
