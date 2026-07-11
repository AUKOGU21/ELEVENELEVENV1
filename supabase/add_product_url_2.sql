-- Second product link for "deciding between two" decisions. The second image
-- already has a home (product_image_url_2); this stores the link that goes with it
-- so the card's "View" button can point at whichever option is being shown.
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS product_url_2 text;
