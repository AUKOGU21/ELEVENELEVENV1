// ── RecommendationModal ───────────────────────────────────────────────────────
// The flow for recommending a product on a Looking For post. Not a comment: paste
// a product URL (image auto-pulls via extract-product), say why, optionally add a
// fit note and who it's for. Produces a recommendation tile.
import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Link as LinkIcon, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";

const INK = "#1C1712";
const CREAM = "#FDFAF6";
const MUTED = "#8C7A70";
const LF = "#7A6AAE";

export interface RecommendationDraft {
  product_url: string | null;
  product_name: string | null;
  brand_name: string | null;
  price_note: string | null;
  product_image_url: string | null;
  reasoning: string;
  recommendation: "buy" | "do_not_buy";
  fit_note: string | null;
  who_for: string | null;
}

interface Product { brand: string; name: string; image_url: string | null; price: string | null; source_url: string; }

interface Props {
  open: boolean;
  lookingForTitle: string | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (draft: RecommendationDraft) => void;
}

export default function RecommendationModal({ open, lookingForTitle, submitting, onClose, onSubmit }: Props) {
  const [url, setUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [reasoning, setReasoning] = useState("");
  const [recommendation, setRecommendation] = useState<"buy" | "do_not_buy">("buy");
  const [fitNote, setFitNote] = useState("");
  const [whoFor, setWhoFor] = useState("");

  const reset = () => { setUrl(""); setExtracting(false); setUrlError(null); setProduct(null); setReasoning(""); setRecommendation("buy"); setFitNote(""); setWhoFor(""); };
  const close = () => { reset(); onClose(); };

  const extract = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    let parsed: URL;
    try { parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`); }
    catch { setUrlError("Enter a valid product link"); return; }
    setUrlError(null); setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-product", { body: { url: parsed.href } });
      if (error) throw error;
      setProduct({ brand: data.brand ?? "", name: data.name ?? "", image_url: data.image_url ?? null, price: data.price ? String(data.price).replace(/^\$/, "") : null, source_url: parsed.href });
    } catch {
      // Still let them recommend the link even if extraction fails.
      setProduct({ brand: "", name: "", image_url: null, price: null, source_url: parsed.href });
    }
    setExtracting(false);
  };

  const canSubmit = !!product && reasoning.trim().length > 2 && !submitting;

  const doSubmit = () => {
    if (!canSubmit || !product) return;
    onSubmit({
      product_url: product.source_url,
      product_name: product.name || null,
      brand_name: product.brand || null,
      price_note: product.price ? `$${product.price.replace(/^\$/, "")}` : null,
      product_image_url: product.image_url,
      reasoning: reasoning.trim(),
      recommendation,
      fit_note: fitNote.trim() || null,
      who_for: whoFor.trim() || null,
    });
    reset();
  };

  const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", borderRadius: 12, border: "1px solid rgba(0,0,0,0.14)", background: "#fff", padding: "11px 13px", fontSize: 14.5, color: INK, fontFamily: "inherit" };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: INK, margin: "0 0 7px", display: "block" };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}
            style={{ position: "fixed", inset: 0, background: "rgba(28,23,18,0.5)", zIndex: 320 }} />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            style={{ position: "fixed", zIndex: 321, left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(500px, 94vw)", maxHeight: "90vh", overflowY: "auto", background: CREAM, borderRadius: 18, boxShadow: "0 24px 64px rgba(0,0,0,0.32)" }}
            className="no-scrollbar"
          >
            <div style={{ padding: "18px 20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: LF }}>Recommend a product</span>
                <button onClick={close} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}><X style={{ width: 18, height: 18 }} /></button>
              </div>
              {lookingForTitle && <p style={{ fontSize: 15, fontWeight: 700, color: INK, margin: "0 0 16px" }}>For: {lookingForTitle}</p>}

              {/* URL */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Paste the product link</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, ...inputStyle, padding: "0 12px" }}>
                    <LinkIcon style={{ width: 16, height: 16, color: MUTED, flexShrink: 0 }} />
                    <input value={url} onChange={(e) => { setUrl(e.target.value); setUrlError(null); }} onKeyDown={(e) => e.key === "Enter" && extract()} placeholder="Paste product URL" style={{ flex: 1, border: "none", outline: "none", background: "transparent", padding: "11px 0", fontSize: 14.5, color: INK }} />
                  </div>
                  <button onClick={extract} disabled={extracting || !url.trim()} style={{ background: INK, color: CREAM, border: "none", borderRadius: 12, padding: "0 18px", fontSize: 14, fontWeight: 600, cursor: extracting || !url.trim() ? "default" : "pointer", opacity: extracting || !url.trim() ? 0.5 : 1 }}>
                    {extracting ? "…" : "Pull"}
                  </button>
                </div>
                {urlError && <p style={{ fontSize: 12.5, color: "#c0392b", margin: "6px 0 0" }}>{urlError}</p>}
              </div>

              {/* Product preview */}
              {product && (
                <div style={{ display: "flex", gap: 12, alignItems: "center", background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 10, marginBottom: 18 }}>
                  <div style={{ width: 58, height: 58, borderRadius: 8, overflow: "hidden", background: "#EDE8E2", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {product.image_url ? <img src={product.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <LinkIcon style={{ width: 18, height: 18, color: MUTED }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                    <input value={product.brand} onChange={(e) => setProduct({ ...product, brand: e.target.value })} placeholder="Brand" style={{ ...inputStyle, padding: "6px 9px", fontSize: 13.5, fontWeight: 700 }} />
                    <input value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} placeholder="Product name" style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5 }} />
                  </div>
                </div>
              )}

              {/* The rest only after a product is attached */}
              {product && (
                <>
                  {/* Would / Wouldn't */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Your take</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {([["buy", "Would buy"], ["do_not_buy", "Wouldn't buy"]] as const).map(([val, lab]) => {
                        const on = recommendation === val;
                        const col = val === "buy" ? "#16a34a" : "#c0392b";
                        return <button key={val} onClick={() => setRecommendation(val)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700, border: on ? `1.5px solid ${col}` : "1px solid rgba(0,0,0,0.14)", background: on ? (val === "buy" ? "rgba(22,163,74,0.10)" : "rgba(192,57,43,0.10)") : "transparent", color: on ? col : "#5A4A42" }}>{lab}</button>;
                      })}
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Why do you recommend this?</label>
                    <textarea value={reasoning} onChange={(e) => setReasoning(e.target.value)} rows={3} placeholder="What makes this a good pick for them?" style={{ ...inputStyle, resize: "none" }} />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Fit note <span style={{ color: MUTED, fontWeight: 400 }}>(optional)</span></label>
                    <input value={fitNote} onChange={(e) => setFitNote(e.target.value)} placeholder="e.g. Runs big, size down" style={inputStyle} />
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <label style={labelStyle}>Who would this work for? <span style={{ color: MUTED, fontWeight: 400 }}>(optional)</span></label>
                    <input value={whoFor} onChange={(e) => setWhoFor(e.target.value)} placeholder="e.g. Tall, long torso, smaller bust" style={inputStyle} />
                  </div>

                  <button onClick={doSubmit} disabled={!canSubmit} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: canSubmit ? INK : "rgba(0,0,0,0.25)", color: CREAM, border: "none", borderRadius: 100, padding: "14px 0", fontSize: 15.5, fontWeight: 600, cursor: canSubmit ? "pointer" : "default" }}>
                    {submitting ? "Sharing…" : <><Check style={{ width: 17, height: 17 }} /> Share recommendation</>}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
