// ── Favorite brands ───────────────────────────────────────────────────────────
// The brands she goes back to, on the Style tab of every profile, shown as logo
// tiles. Logos come from Brandfetch (free Logo API, no attribution needed).
//
// Each brand is stored with its website ({ name, domain }) because Brandfetch
// looks logos up by domain, not by name. She picks the match from a search as
// she types, so she sees the logo before she saves it. A brand Brandfetch
// doesn't know (small labels) is kept by name and shows as a black name tile.
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { C, RADIUS, SANS, body, display, meta, strong } from "@/lib/design";

/** Brandfetch client ID. Public by design: it rides on every logo URL. */
export const BRANDFETCH_CLIENT_ID = (import.meta.env.VITE_BRANDFETCH_CLIENT_ID as string | undefined) || "1idgvll_PTWz0GvwlPd";

export const BRANDS_MAX = 8;

export interface FavBrand { name: string; domain?: string | null }

/** Whatever is stored (objects, or plain names from earlier) as a clean list. */
export function readBrands(raw: unknown): FavBrand[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b: any): FavBrand | null => (typeof b === "string" ? { name: b } : b && typeof b.name === "string" ? { name: b.name, domain: b.domain ?? null } : null))
    .filter((b): b is FavBrand => !!b && !!b.name.trim());
}

export function logoUrl(domain: string, size = 400): string | null {
  if (!BRANDFETCH_CLIENT_ID) return null;
  return `https://cdn.brandfetch.io/${encodeURIComponent(domain)}/w/${size}/h/${size}/fallback/404/type/logo?c=${BRANDFETCH_CLIENT_ID}`;
}

function Tile({ brand, isMobile }: { brand: FavBrand; isMobile: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = brand.domain && !failed ? logoUrl(brand.domain) : null;
  const tile: React.CSSProperties = {
    aspectRatio: "1 / 1", borderRadius: RADIUS, overflow: "hidden", display: "flex",
    alignItems: "center", justifyContent: "center", textAlign: "center", padding: isMobile ? 14 : 20, boxSizing: "border-box",
  };
  if (src) {
    return (
      <div style={{ ...tile, background: "#FFFFFF", border: `1px solid ${C.rule}` }} title={brand.name}>
        <img src={src} alt={brand.name} loading="lazy" onError={() => setFailed(true)}
          style={{ maxWidth: "100%", maxHeight: "62%", objectFit: "contain", display: "block" }} />
      </div>
    );
  }
  return (
    <div style={{ ...tile, background: C.ink }} title={brand.name}>
      <span style={{ ...display(isMobile ? 17 : 22, C.paper), lineHeight: 0.95, overflowWrap: "anywhere" }}>{brand.name}</span>
    </div>
  );
}

/** The logo grid on a profile. */
export function FavoriteBrandTiles({ brands, isMobile, heading }: { brands: FavBrand[]; isMobile: boolean; heading: React.CSSProperties }) {
  if (!brands.length) return null;
  return (
    <div>
      <h2 style={heading}>Favorite brands</h2>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, minmax(0, 1fr))" : "repeat(4, minmax(0, 160px))", gap: isMobile ? 8 : 14, marginTop: 14 }}>
        {brands.map((b) => <Tile key={`${b.name}-${b.domain ?? ""}`} brand={b} isMobile={isMobile} />)}
      </div>
    </div>
  );
}

interface Hit { name: string; domain: string; icon?: string | null }

const fieldStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", borderRadius: RADIUS, border: `1px solid ${C.rule}`, background: "#FFFFFF",
  padding: "11px 13px", fontFamily: SANS, fontSize: 16, lineHeight: 1.5, color: C.ink, outline: "none",
};

/** Edit: search Brandfetch as she types, pick the right company, or keep her own words. */
export function FavoriteBrandPicker({ value, onChange }: { value: FavBrand[]; onChange: (v: FavBrand[]) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const full = value.length >= BRANDS_MAX;
  const has = (b: FavBrand) => value.some((v) => (b.domain && v.domain === b.domain) || v.name.toLowerCase() === b.name.toLowerCase());

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const qs = BRANDFETCH_CLIENT_ID ? `?c=${BRANDFETCH_CLIENT_ID}` : "";
        const r = await fetch(`https://api.brandfetch.io/v2/search/${encodeURIComponent(term)}${qs}`);
        const data = r.ok ? await r.json() : [];
        if (mine !== seq.current) return;
        setHits((Array.isArray(data) ? data : [])
          .filter((h: any) => h?.domain && h?.name)
          .slice(0, 5)
          .map((h: any) => ({ name: h.name, domain: h.domain, icon: h.icon ?? null })));
      } catch { if (mine === seq.current) setHits([]); }
      finally { if (mine === seq.current) setBusy(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const add = (b: FavBrand) => {
    setQ(""); setHits([]);
    const name = b.name.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!name || full || has(b)) return;
    onChange([...value, { name, domain: b.domain ?? null }]);
  };

  const typed = q.trim();
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <label htmlFor="profile-brands" style={strong(14)}>Your favorite brands</label>
        <span style={meta(10.5, full ? C.burgundy : C.muted)}>{value.length}/{BRANDS_MAX}</span>
      </div>
      <p style={{ ...body(13, C.muted), marginTop: 4 }}>The ones you go back to. Pick the right one so its logo shows.</p>

      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {value.map((b) => {
            const src = b.domain ? logoUrl(b.domain, 96) : null;
            return (
              <span key={`${b.name}-${b.domain ?? ""}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 8px 6px 6px", border: `1px solid ${C.rule}`, borderRadius: RADIUS, background: "#FFFFFF" }}>
                {src && <img src={src} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
                <span style={{ ...meta(10.5, C.ink), fontWeight: 700, letterSpacing: "0.06em" }}>{b.name}</span>
                <button onClick={() => onChange(value.filter((x) => x !== b))} aria-label={`Remove ${b.name}`} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.muted, lineHeight: 0 }}>
                  <X style={{ width: 12, height: 12 }} strokeWidth={2} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {!full && (
        <div style={{ position: "relative", marginTop: 12 }}>
          <input id="profile-brands" value={q} onChange={(e) => setQ(e.target.value)} maxLength={40} autoComplete="off"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (hits[0] && hits[0].name.toLowerCase() === typed.toLowerCase()) add(hits[0]); else if (typed) add({ name: typed }); } }}
            placeholder={value.length ? "Add another" : "e.g. Khaite"} style={fieldStyle} />
          {typed.length >= 2 && (
            <div role="listbox" style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: RADIUS, overflow: "hidden", zIndex: 10 }}>
              {hits.map((h, i) => (
                <button key={h.domain} role="option" onMouseDown={(e) => e.preventDefault()} onClick={() => add(h)}
                  style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "9px 13px", background: "none", border: "none", borderTop: i ? `1px solid ${C.rule}` : "none", cursor: "pointer" }}>
                  <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 4, background: C.well, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {h.icon && <img src={h.icon} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ ...body(14, C.ink), display: "block" }}>{h.name}</span>
                    <span style={{ ...body(12, C.muted), display: "block" }}>{h.domain}</span>
                  </span>
                </button>
              ))}
              {busy && !hits.length && <p style={{ ...body(13, C.muted), padding: "10px 13px" }}>Looking...</p>}
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => add({ name: typed })}
                style={{ ...body(13, C.muted), width: "100%", textAlign: "left", padding: "10px 13px", background: "none", border: "none", borderTop: hits.length || busy ? `1px solid ${C.rule}` : "none", cursor: "pointer" }}>
                Add “{typed}” without a logo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
