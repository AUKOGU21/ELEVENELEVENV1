// Shared "read a pasted product link" helper. Backs both the Passed → bought
// something else step and the Looking For → I found it flow, so a link pasted
// anywhere in the app resolves to the same brand / name / price / image the
// original post would have gotten.
import { supabase } from "@/lib/supabase";

export interface PulledProduct {
  brand: string | null;
  name: string | null;
  image_url: string | null;
  price: string | null;
}

// Accept a pasted link with or without a protocol so "zara.com/..." still works.
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// Returns null when the link can't be read. Never throws — a failed pull should
// only cost the image, never the link she took the trouble to paste.
export async function pullProduct(rawUrl: string): Promise<PulledProduct | null> {
  const url = normalizeUrl(rawUrl);
  if (!url) return null;
  try {
    const { data, error } = await supabase.functions.invoke("extract-product", { body: { url } });
    if (error) throw error;
    const pulled: PulledProduct = {
      brand: data?.brand || null,
      name: data?.name || null,
      image_url: data?.image_url || null,
      price: data?.price ? String(data.price) : null,
    };
    if (!pulled.brand && !pulled.name && !pulled.image_url) return null;
    return pulled;
  } catch {
    return null;
  }
}
