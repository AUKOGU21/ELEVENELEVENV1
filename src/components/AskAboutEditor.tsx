// ── AskAboutEditor ────────────────────────────────────────────────────────────
// "What should people ask you about?" Used in Edit profile and in the prompt
// that asks returning members who haven't filled it in yet.
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { C, RADIUS, SANS, body, meta, strong } from "@/lib/design";

// 16px so iOS doesn't zoom the page when the field takes focus.
const fieldStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: RADIUS,
  border: `1px solid ${C.rule}`,
  background: "#FFFFFF",
  padding: "11px 13px",
  fontFamily: SANS,
  fontSize: 16,
  lineHeight: 1.5,
  color: C.ink,
  outline: "none",
  resize: "none",
};

const textLink = (colour: string): React.CSSProperties => ({
  ...meta(11, colour),
  fontWeight: 700,
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
});

export const ASK_MAX = 5;
export const ASK_LEN = 32;

/** Seeds the autocomplete before other women's answers and posted brands fill it in. */
export const ASK_TOPICS = [
  "Tall-girl denim", "Petite fits", "Curvy fits", "Plus-size fits", "Designer bags", "Luxury bags", "Vintage",
  "Resale", "Workwear", "Wedding guest", "Swimwear", "Activewear", "Bra sizing", "Wide feet", "Sneakers", "Heels",
  "Denim", "Tailoring", "Knitwear", "Outerwear", "Capsule wardrobe", "Quality vs. price", "Sizing across brands",
  "Skincare", "Makeup", "Haircare", "Fragrance", "Jewelry", "Maternity",
];

/**
 * Up to five things she knows well. Suggestions where they exist, her own words
 * where they don't. What she picks reads as underlined words with an x, the way
 * the size picker marks a choice: no pills.
 */
export default function AskAboutEditor({ value, onChange, pool, bare }: {
  value: string[];
  onChange: (v: string[]) => void;
  pool: string[];
  /** No question or helper line: the prompt around it is already asking. */
  bare?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(-1);
  const full = value.length >= ASK_MAX;
  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const needle = q.trim().toLowerCase();
  const matches = needle ? pool.filter((p) => p.toLowerCase().includes(needle) && !has(p)).slice(0, 6) : [];

  const add = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, " ").slice(0, ASK_LEN);
    setQ(""); setHi(-1);
    if (!t || full || has(t)) return;
    onChange([...value, t]);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(hi >= 0 && matches[hi] ? matches[hi] : q); }
    else if (e.key === "ArrowDown" && matches.length) { e.preventDefault(); setHi((h) => Math.min(matches.length - 1, h + 1)); }
    else if (e.key === "ArrowUp" && matches.length) { e.preventDefault(); setHi((h) => Math.max(-1, h - 1)); }
    else if (e.key === "Backspace" && !q && value.length) onChange(value.slice(0, -1));
    else if (e.key === "Escape") { setQ(""); setHi(-1); }
  };

  return (
    <div>
      {!bare && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <label htmlFor="profile-ask" style={strong(14)}>What should people ask you about?</label>
            <span style={meta(10.5, full ? C.burgundy : C.muted)}>{value.length}/{ASK_MAX}</span>
          </div>
          <p style={{ ...body(13, C.muted), marginTop: 4 }}>Brands, luxury bags, fit problems, or anything you know really well.</p>
        </>
      )}

      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: 20, rowGap: 12, marginTop: bare ? 0 : 14, marginBottom: bare ? 14 : 0 }}>
          {value.map((v) => (
            <span key={v} style={{ ...meta(11, C.ink), fontWeight: 700, letterSpacing: "0.08em", display: "inline-flex", alignItems: "center", gap: 8, paddingBottom: 4, borderBottom: `1px solid ${C.burgundy}` }}>
              {v}
              <button onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.muted, lineHeight: 0 }}>
                <X style={{ width: 12, height: 12 }} strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      )}

      {!full && (
        <div style={{ position: "relative", marginTop: bare ? 0 : 12 }}>
          <input
            id="profile-ask"
            value={q}
            maxLength={ASK_LEN}
            onChange={(e) => { setQ(e.target.value); setHi(-1); }}
            onKeyDown={onKey}
            placeholder={value.length ? "Add another" : "e.g. Tall-girl denim"}
            autoComplete="off"
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-controls="profile-ask-list"
            aria-label={bare ? "What should people ask you about?" : undefined}
            style={{ ...fieldStyle, paddingRight: q.trim() ? 64 : 13 }}
          />
          {q.trim() && (
            <button onClick={() => add(q)} style={{ ...textLink(C.burgundy), position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)" }}>Add</button>
          )}
          {matches.length > 0 && (
            <div id="profile-ask-list" role="listbox" style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: RADIUS, overflow: "hidden", zIndex: 10 }}>
              {matches.map((m, i) => (
                <button key={m} role="option" aria-selected={i === hi} onMouseDown={(e) => e.preventDefault()} onClick={() => add(m)}
                  style={{ ...body(14, C.ink), width: "100%", textAlign: "left", padding: "10px 13px", background: i === hi ? C.well : "none", border: "none", borderTop: i ? `1px solid ${C.rule}` : "none", cursor: "pointer" }}>
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Suggestions: the seed topics, then what other women offer and the brands
 * posted here. Fetched once, the first time `enabled` turns true.
 */
export function useAskPool(enabled: boolean): string[] {
  const [pool, setPool] = useState<string[]>(ASK_TOPICS);
  const loaded = useRef(false);
  useEffect(() => {
    if (!enabled || loaded.current) return;
    loaded.current = true;
    (async () => {
      const [askRes, brandRes] = await Promise.all([
        supabase.from("profiles").select("ask_me_about").not("ask_me_about", "is", null).limit(500),
        supabase.from("decisions").select("brand_name").not("brand_name", "is", null).is("deleted_at", null).limit(1000),
      ]);
      const seen = new Set<string>();
      const out: string[] = [];
      const push = (v: unknown) => {
        if (typeof v !== "string") return;
        const t = v.trim();
        if (!t || t.length > ASK_LEN || seen.has(t.toLowerCase())) return;
        seen.add(t.toLowerCase()); out.push(t);
      };
      ASK_TOPICS.forEach(push);
      ((askRes.data ?? []) as { ask_me_about: string[] | null }[]).forEach((r) => (r.ask_me_about ?? []).forEach(push));
      ((brandRes.data ?? []) as { brand_name: string | null }[]).forEach((r) => push(r.brand_name));
      setPool(out);
    })();
  }, [enabled]);
  return pool;
}
