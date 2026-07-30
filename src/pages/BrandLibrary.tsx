import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight, X, Plus, RefreshCw, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { imageToJpeg } from "@/lib/image";
import { BRANDS, brandBySlug, seededCount, INSIGHT_CATEGORIES, INSIGHT_CONTEXTS, type Brand } from "@/lib/brands";

// ── palette ───────────────────────────────────────────────────────────────────
const INK = "#1C1712";
const MUTED = "#8C7A70";
const GOLD = "#B8956A";
const GREEN = "#5DA35D";
const CREAM = "#FDFAF6";
const LINE = "rgba(28,23,18,0.10)";

interface Insight {
  id: string;
  learned: string;
  category: string | null;
  contexts: string[] | null;
  size_bought: string | null;
  height: string | null;
  note: string | null;
  photo_url: string | null;
}

interface RecentDecision {
  id: string;
  product_name: string | null;
  product_image_url: string | null;
  uncertainty_text: string | null;
  created_at: string;
  responseCount: number;
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const w = Math.floor(days / 7);
  return w === 1 ? "1 week ago" : `${w} weeks ago`;
}

// Brand logo: uses /brand-logos/<slug>.png if present, else a clean text wordmark.
function BrandLogo({ brand, size = 64 }: { brand: Brand; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box: React.CSSProperties = {
    width: size, height: size, flexShrink: 0, borderRadius: 8,
    border: `1px solid ${LINE}`, background: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
  };
  if (failed) {
    return (
      <div style={box}>
        <span style={{ fontFamily: "Georgia, serif", fontSize: Math.max(9, size / 6.5), letterSpacing: "0.06em", color: INK, textAlign: "center", padding: 4, lineHeight: 1.1 }}>
          {brand.name}
        </span>
      </div>
    );
  }
  return (
    <div style={box}>
      <img src={`/brand-logos/${brand.slug}.png`} alt={brand.name} onError={() => setFailed(true)}
        style={{ maxWidth: "82%", maxHeight: "82%", objectFit: "contain" }} />
    </div>
  );
}

// ── Top nav ───────────────────────────────────────────────────────────────────
function TopNav() {
  const navigate = useNavigate();
  const item = (label: string, active: boolean, onClick: () => void) => (
    <button onClick={onClick} style={{
      background: "none", border: "none", cursor: "pointer", padding: "4px 2px",
      fontSize: 16, color: active ? INK : MUTED, fontWeight: active ? 700 : 500,
      borderBottom: active ? `2px solid ${INK}` : "2px solid transparent",
    }}>{label}</button>
  );
  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", borderBottom: `1px solid ${LINE}`, position: "sticky", top: 0, background: "rgba(253,250,246,0.92)", backdropFilter: "blur(8px)", zIndex: 20 }}>
      <span onClick={() => navigate("/")} style={{ letterSpacing: "0.28em", fontSize: 17, color: INK, cursor: "pointer", whiteSpace: "nowrap" }}>
        <span style={{ fontWeight: 700 }}>ELEVEN</span><span style={{ fontWeight: 300 }}>ELEVEN</span>
      </span>
      <nav style={{ display: "flex", gap: 26 }}>
        {item("Feed", false, () => navigate("/feed"))}
        {item("Brands", true, () => {})}
        {item("Mine", false, () => navigate("/feed", { state: { tab: "mine" } }))}
      </nav>
      <button onClick={() => navigate("/post")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 100, border: `1px solid ${GOLD}`, background: "transparent", color: GOLD, fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
        <Plus style={{ width: 14, height: 14 }} /> Post
      </button>
    </header>
  );
}

// ── input styles ──────────────────────────────────────────────────────────────
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", borderRadius: 10, border: `1px solid ${LINE}`, background: "#fff", padding: "11px 13px", fontSize: 15, color: INK, fontFamily: "inherit" };
const darkBtn: React.CSSProperties = { padding: "11px 22px", borderRadius: 8, border: "none", background: INK, color: CREAM, fontSize: 15, fontWeight: 600, cursor: "pointer" };
const ghostBtn: React.CSSProperties = { padding: "11px 18px", borderRadius: 8, border: `1px solid ${LINE}`, background: "transparent", color: MUTED, fontSize: 15, fontWeight: 600, cursor: "pointer" };
const chip = (active: boolean): React.CSSProperties => ({ padding: "8px 14px", borderRadius: 100, border: `1.5px solid ${active ? GOLD : LINE}`, background: active ? "rgba(184,149,106,0.10)" : "transparent", color: active ? INK : "#5A4F47", fontSize: 14, fontWeight: 500, cursor: "pointer" });
const modalWrap: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const modalCard: React.CSSProperties = { position: "relative", zIndex: 1, width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto", background: CREAM, borderRadius: 18, padding: 24, boxShadow: "0 16px 48px rgba(0,0,0,0.3)" };
const sectionLbl: React.CSSProperties = { fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED, margin: "0 0 10px" };

export default function BrandLibrary() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [slug, setSlug] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [insights, setInsights] = useState<Insight[]>([]);
  const [recent, setRecent] = useState<RecentDecision[]>([]);

  const brand = slug ? brandBySlug(slug) : null;

  // ── load a brand's community insights + recent feed decisions ───────────────
  const loadBrand = useCallback(async (b: Brand) => {
    setInsights([]); setRecent([]);
    // Community insights (resilient — table may not exist until the migration runs).
    try {
      const { data } = await supabase.from("brand_insights")
        .select("id, learned, category, contexts, size_bought, height, note, photo_url")
        .eq("brand_slug", b.slug).order("created_at", { ascending: false });
      if (data) setInsights(data as Insight[]);
    } catch { /* table not created yet — show seeded only */ }
    // Recent decisions from the Feed that belong to this brand.
    try {
      const orExpr = b.matchNames.map((n) => `brand_name.ilike.%${n}%`).join(",");
      const { data } = await supabase.from("decisions")
        .select("id, product_name, product_image_url, uncertainty_text, created_at, responses(id)")
        .eq("is_public", true).is("deleted_at", null).neq("status", "outcome_logged")
        .or(orExpr).order("created_at", { ascending: false }).limit(6);
      if (data) setRecent((data as any[]).map((d) => ({
        id: d.id, product_name: d.product_name, product_image_url: d.product_image_url,
        uncertainty_text: d.uncertainty_text, created_at: d.created_at,
        responseCount: Array.isArray(d.responses) ? d.responses.length : 0,
      })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (brand) loadBrand(brand); }, [brand, loadBrand]);

  const openBrand = (s: string) => { setSlug(s); window.scrollTo(0, 0); };

  const filtered = BRANDS.filter((b) => b.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div style={{ minHeight: "100vh", background: CREAM }}>
      <TopNav />
      {brand
        ? <BrandDetail brand={brand} insights={insights} recent={recent} onBack={() => setSlug(null)} onPick={openBrand}
            user={user} navigate={navigate} reload={() => loadBrand(brand)} />
        : (
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "36px 20px 60px" }}>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 40, color: INK, margin: "0 0 8px", letterSpacing: "-0.01em" }}>Brand Library</h1>
            <p style={{ fontSize: 16, color: MUTED, margin: "0 0 26px" }}>Real insights from real women, so you can shop with confidence.</p>

            <div style={{ position: "relative", marginBottom: 28 }}>
              <Search style={{ width: 17, height: 17, color: MUTED, position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)" }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search brands..."
                style={{ ...field, borderRadius: 100, padding: "13px 16px 13px 42px", fontSize: 16 }} />
            </div>

            <div>
              {filtered.map((b) => (
                <button key={b.slug} onClick={() => openBrand(b.slug)}
                  style={{ display: "flex", alignItems: "center", gap: 16, width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${LINE}`, padding: "18px 4px", cursor: "pointer" }}>
                  <BrandLogo brand={b} size={60} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 19, fontWeight: 700, color: INK }}>{b.name}</span>
                      {b.growing && <span style={{ fontSize: 11, fontWeight: 600, color: "#6E7A44", background: "rgba(110,122,68,0.10)", borderRadius: 100, padding: "2px 9px" }}>Growing</span>}
                    </div>
                    <p style={{ fontSize: 13, color: GOLD, margin: "3px 0 4px" }}>{seededCount(b)} things we've learned</p>
                    <p style={{ fontSize: 14, color: MUTED, margin: 0, lineHeight: 1.4 }}>{b.description}</p>
                  </div>
                  <ChevronRight style={{ width: 20, height: 20, color: MUTED, flexShrink: 0 }} />
                </button>
              ))}
              {filtered.length === 0 && <p style={{ color: MUTED, padding: "24px 4px" }}>No brands match "{search}".</p>}
            </div>

            <SuggestBrandBlock user={user} navigate={navigate} />
          </div>
        )}
    </div>
  );
}

// ── Brand detail ──────────────────────────────────────────────────────────────
function BrandDetail({ brand, insights, recent, onBack, onPick, user, navigate, reload }: {
  brand: Brand; insights: Insight[]; recent: RecentDecision[];
  onBack: () => void; onPick: (s: string) => void; user: any; navigate: any; reload: () => void;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const totalCount = seededCount(brand) + insights.length;

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "20px 20px 60px", display: "flex", gap: 28 }}>
      {/* Sidebar */}
      <aside style={{ width: 210, flexShrink: 0, position: "sticky", top: 78, alignSelf: "flex-start", display: "none" }} className="brand-sidebar">
        <p style={sectionLbl}>Browse brands</p>
        {BRANDS.map((b) => (
          <button key={b.slug} onClick={() => onPick(b.slug)}
            style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", background: b.slug === brand.slug ? "rgba(0,0,0,0.04)" : "none", border: "none", borderRadius: 10, padding: "8px 8px", cursor: "pointer", marginBottom: 2 }}>
            <BrandLogo brand={b} size={34} />
            <span style={{ fontSize: 14, fontWeight: b.slug === brand.slug ? 700 : 500, color: INK, lineHeight: 1.1 }}>{b.name}</span>
          </button>
        ))}
      </aside>

      {/* Main */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: MUTED, fontSize: 14, cursor: "pointer", padding: 0, marginBottom: 18 }}>&larr; Back to brands</button>

        {/* Header */}
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", marginBottom: 26 }}>
          <BrandLogo brand={brand} size={72} />
          <div>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 34, color: INK, margin: "0 0 6px" }}>{brand.name}</h1>
            <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, background: "rgba(0,0,0,0.05)", borderRadius: 100, padding: "3px 11px" }}>{totalCount} community insights</span>
            <p style={{ fontSize: 15, color: MUTED, margin: "12px 0 0", lineHeight: 1.5 }}>{brand.description}</p>
          </div>
        </div>

        {/* Section 1 — What women have learned */}
        <Section title="What women have learned">
          {brand.whatWomenLearned.map((t, i) => <InsightRow key={i} text={t} />)}
        </Section>

        {/* Section 2 — Things to know before you buy (titled cards + community insights) */}
        <Section title="Things to know before you buy">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 20 }}>
            {brand.thingsToKnow.map((c, i) => <KnowCard key={`s${i}`} title={c.title} body={c.body} />)}
            {insights.map((ins) => (
              <KnowCard key={ins.id} title={ins.category || "From the community"} body={ins.learned}
                meta={ins.contexts?.length ? ins.contexts.join(", ") : undefined} />
            ))}
          </div>
        </Section>

        {/* Section 3 — Recent decisions */}
        <div style={{ marginBottom: 30 }}>
          <p style={sectionLbl}>Recent decisions</p>
          {recent.length === 0 ? (
            <p style={{ fontSize: 14, color: MUTED, fontStyle: "italic", margin: 0 }}>None yet.</p>
          ) : (
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6 }}>
              {recent.map((d) => {
                const unc = (d.uncertainty_text ?? "").split(",")[0]?.trim();
                return (
                  <button key={d.id} onClick={() => navigate("/feed")} style={{ width: 168, flexShrink: 0, textAlign: "left", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden", cursor: "pointer", padding: 0 }}>
                    <div style={{ width: "100%", height: 150, background: "#EDE8E2" }}>
                      {d.product_image_url && <img src={d.product_image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />}
                    </div>
                    <div style={{ padding: "9px 10px 11px" }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: "0 0 2px", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.product_name ?? "A decision"}</p>
                      {unc && <p style={{ fontSize: 12, color: MUTED, margin: "0 0 6px" }}>{unc}</p>}
                      <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>{d.responseCount} response{d.responseCount === 1 ? "" : "s"} · {timeAgo(d.created_at)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 4 — Share an insight */}
        <div style={{ background: "#F6F1EA", border: `1px solid rgba(196,158,100,0.5)`, borderRadius: 14, padding: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: INK, margin: "0 0 3px" }}>Have a shopping insight about {brand.name}?</p>
            <p style={{ fontSize: 14, color: MUTED, margin: 0 }}>Share what you've learned to help another woman shop with confidence.</p>
          </div>
          <button onClick={() => (user ? setShareOpen(true) : navigate("/signin"))} style={darkBtn}>Share an insight</button>
        </div>
      </div>

      {shareOpen && <ShareInsightModal brand={brand} user={user} onClose={() => setShareOpen(false)} onDone={() => { setShareOpen(false); reload(); }} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: "18px 20px", marginBottom: 20 }}>
      <p style={{ fontSize: 15, fontWeight: 700, color: INK, margin: "0 0 14px", display: "flex", alignItems: "center", gap: 8 }}>{title}</p>
      {children}
    </div>
  );
}

function InsightRow({ text, meta }: { text: string; meta?: string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
      <span style={{ width: 18, height: 18, borderRadius: "50%", background: GREEN, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
        <Check style={{ width: 11, height: 11, color: "#fff" }} />
      </span>
      <div>
        <p style={{ fontSize: 15, color: "#3A3530", margin: 0, lineHeight: 1.5 }}>{text}</p>
        {meta && <p style={{ fontSize: 12, color: MUTED, margin: "2px 0 0", textTransform: "capitalize" }}>{meta}</p>}
      </div>
    </div>
  );
}

function KnowCard({ title, body, meta }: { title: string; body: string; meta?: string }) {
  return (
    <div>
      <p style={{ fontSize: 14, fontWeight: 700, color: INK, margin: "0 0 5px" }}>{title}</p>
      <p style={{ fontSize: 14, color: MUTED, margin: 0, lineHeight: 1.5 }}>{body}</p>
      {meta && <p style={{ fontSize: 12, color: MUTED, margin: "6px 0 0", textTransform: "capitalize", opacity: 0.75 }}>{meta}</p>}
    </div>
  );
}

// ── Share an insight (3 steps) ────────────────────────────────────────────────
function ShareInsightModal({ brand, user, onClose, onDone }: { brand: Brand; user: any; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [learned, setLearned] = useState("");
  const [category, setCategory] = useState("");
  const [contexts, setContexts] = useState<string[]>([]);
  const [sizeBought, setSizeBought] = useState("");
  const [height, setHeight] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const toggleCtx = (c: string) => setContexts((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);

  const submit = async () => {
    if (!user || !learned.trim() || saving) return;
    setSaving(true);
    let photo_url: string | null = null;
    if (photo) {
      try {
        const jpeg = await imageToJpeg(photo);
        const path = `brand-insights/${user.id}/${Date.now()}.jpg`;
        const { data: up } = await supabase.storage.from("product-images").upload(path, jpeg, { upsert: true, contentType: "image/jpeg" });
        if (up) photo_url = supabase.storage.from("product-images").getPublicUrl(up.path).data.publicUrl;
      } catch { /* skip photo on failure */ }
    }
    try {
      await supabase.from("brand_insights").insert({
        brand_slug: brand.slug, learned: learned.trim(), category: category || null,
        contexts: contexts.length ? contexts : null, size_bought: sizeBought.trim() || null,
        height: height.trim() || null, note: note.trim() || null, photo_url, user_id: user.id,
      });
      onDone();
    } catch (e) { console.error("insight submit failed:", e); setSaving(false); }
  };

  return (
    <div style={modalWrap}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
      <div style={modalCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <p style={{ fontFamily: "Georgia, serif", fontSize: 21, color: INK, margin: 0 }}>Share an insight about {brand.name}</p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}><X style={{ width: 18, height: 18 }} /></button>
        </div>
        <p style={{ fontSize: 13, color: MUTED, margin: "0 0 18px" }}>You're contributing knowledge, not writing a review.</p>

        {step === 1 && (
          <div>
            <p style={sectionLbl}>What did you learn?</p>
            <textarea value={learned} onChange={(e) => setLearned(e.target.value)} rows={3} placeholder="Runs relaxed. Don't size down expecting a fitted silhouette." style={{ ...field, resize: "none", marginBottom: 16 }} />
            <p style={sectionLbl}>Category</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {INSIGHT_CATEGORIES.map((c) => <button key={c} onClick={() => setCategory(c)} style={chip(category === c)}>{c}</button>)}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
              <button disabled={!learned.trim()} onClick={() => setStep(2)} style={{ ...darkBtn, opacity: learned.trim() ? 1 : 0.4 }}>Next</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <p style={sectionLbl}>Who is this true for?</p>
            <p style={{ fontSize: 13, color: MUTED, margin: "-4px 0 12px" }}>Every insight is contextual — select all that apply.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {INSIGHT_CONTEXTS.map((c) => <button key={c} onClick={() => toggleCtx(c)} style={chip(contexts.includes(c))}>{c}</button>)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
              <button onClick={() => setStep(1)} style={ghostBtn}>Back</button>
              <button onClick={() => setStep(3)} style={darkBtn}>Next</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <p style={sectionLbl}>Add any helpful context (optional)</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <input value={sizeBought} onChange={(e) => setSizeBought(e.target.value)} placeholder="Size (e.g. 6)" style={field} />
              <input value={height} onChange={(e) => setHeight(e.target.value)} placeholder="Height (e.g. 5'8&quot;)" style={field} />
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything else that might help?" style={{ ...field, resize: "none", marginBottom: 10 }} />
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, color: MUTED, cursor: "pointer" }}>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              <span style={{ ...ghostBtn, padding: "8px 14px" }}>{photo ? "✓ Photo added" : "+ Add a photo (optional)"}</span>
            </label>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
              <button onClick={() => setStep(2)} style={ghostBtn}>Back</button>
              <button disabled={saving} onClick={submit} style={{ ...darkBtn, opacity: saving ? 0.6 : 1 }}>{saving ? "Sharing…" : "Submit insight"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Suggest a brand (landing footer + modal) ──────────────────────────────────
function SuggestBrandBlock({ user, navigate }: { user: any; navigate: any }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div style={{ marginTop: 34, background: "rgba(0,0,0,0.03)", border: `1px solid ${LINE}`, borderRadius: 14, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <RefreshCw style={{ width: 18, height: 18, color: MUTED }} />
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: INK, margin: 0 }}>Didn't find the brand you're looking for?</p>
            <p style={{ fontSize: 13, color: MUTED, margin: "2px 0 0" }}>Suggest a brand and help build the library.</p>
          </div>
        </div>
        <button onClick={() => (user ? setOpen(true) : navigate("/signin"))} style={{ padding: "10px 20px", borderRadius: 100, border: "none", background: GOLD, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Suggest a brand</button>
      </div>
      {open && <SuggestBrandModal user={user} onClose={() => setOpen(false)} />}
    </>
  );
}

function SuggestBrandModal({ user, onClose }: { user: any; onClose: () => void }) {
  const [name, setName] = useState("");
  const [want, setWant] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!user || !name.trim() || saving) return;
    setSaving(true);
    try {
      await supabase.from("brand_suggestions").insert({ brand_name: name.trim(), want_to_know: want.trim() || null, user_id: user.id });
      setDone(true);
    } catch (e) { console.error("suggestion failed:", e); setSaving(false); }
  };

  return (
    <div style={modalWrap}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
      <div style={modalCard}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}><X style={{ width: 18, height: 18 }} /></button>
        </div>
        {done ? (
          <div style={{ textAlign: "center", padding: "8px 6px 12px" }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: INK, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Check style={{ width: 22, height: 22, color: CREAM }} />
            </div>
            <p style={{ fontFamily: "Georgia, serif", fontSize: 22, color: INK, margin: "0 0 10px" }}>Thanks!</p>
            <p style={{ fontSize: 15, color: "#3A3530", lineHeight: 1.55, margin: "0 auto", maxWidth: 340 }}>
              We're reviewing this brand for the Brand Library. We'll notify you when it's added. In the meantime, we'll use your suggestion to prioritize future interviews and community insights.
            </p>
            <button onClick={onClose} style={{ ...darkBtn, marginTop: 20 }}>Done</button>
          </div>
        ) : (
          <div>
            <p style={{ fontFamily: "Georgia, serif", fontSize: 22, color: INK, margin: "0 0 18px" }}>Suggest a brand</p>
            <p style={sectionLbl}>What brand should we build next?</p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Type the brand name" style={{ ...field, marginBottom: 18 }} />
            <p style={sectionLbl}>What would you want to know before buying this brand?</p>
            <textarea value={want} onChange={(e) => setWant(e.target.value)} rows={3} placeholder="Fit, quality, sizing, fabric…" style={{ ...field, resize: "none" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
              <button disabled={!name.trim() || saving} onClick={submit} style={{ ...darkBtn, opacity: name.trim() && !saving ? 1 : 0.4 }}>{saving ? "Submitting…" : "Submit"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
