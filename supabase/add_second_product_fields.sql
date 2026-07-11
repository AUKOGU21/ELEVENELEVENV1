-- Name / brand / price for the second "deciding between two" option, so the card
-- text tracks whichever option is swiped into view (image + link already stored
-- in product_image_url_2 / product_url_2).
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS product_name_2 text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS brand_name_2 text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS price_note_2 text;
