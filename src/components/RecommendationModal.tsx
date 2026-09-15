// ── RecommendationModal ───────────────────────────────────────────────────────
// The flow for recommending a product on a Looking For post. Not a comment: paste
// a product URL (image auto-pulls via extract-product), say why, optionally add a
// fit note and who it's for. Produces a recommendation tile.
import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Link as LinkIcon, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ProductImage } from "./ProductImage";
import { C, SANS, display, meta } from "@/lib/design";

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

  const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", borderRadius: 2, border: `1px solid ${C.rule}`, background: "#FFFFFF", padding: "12px 14px", fontFamily: SANS, fontSize: 14.5, lineHeight: 1.5, color: C.ink, outline: "none" };
  const label: React.CSSProperties = { ...meta(10.5, C.ink), fontWeight: 700, display: "block", marginBottom: 8 };
  const optional = <span style={{ ...meta(10, C.muted), fontWeight: 600, marginLeft: 6 }}>(optional)</span>;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}
          style={{ position: "fixed", inset: 0, background: C.scrim, zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box" }}>
          <motion.div onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            style={{ position: "relative", width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto", background: C.paper, borderRadius: 2, border: `1px solid ${C.rule}` }}
            className="no-scrollbar"
          >
            <div style={{ padding: "24px 26px 28px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ ...meta(11, C.burgundy), fontWeight: 700 }}>Recommend a product</span>
                <button onClick={close} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: C.ink, lineHeight: 0, padding: 4 }}>
                  <X style={{ width: 20, height: 20 }} strokeWidth={1.5} />
                </button>
              </div>
              {lookingForTitle && <p style={{ ...display(30), lineHeight: 0.95, margin: "14px 0 22px" }}>For: {lookingForTitle}</p>}

              {/* The link */}
              <div style={{ marginBottom: 18 }}>
                <label style={label}>Paste the product link</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, position: "relative" }}>
                    <LinkIcon style={{ width: 15, height: 15, color: C.muted, position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                    <input value={url} onChange={(e) => { setUrl(e.target.value); setUrlError(null); }} onKeyDown={(e) => e.key === "Enter" && extract()} placeholder="Paste product URL" style={{ ...field, paddingLeft: 36 }} />
                  </div>
                  <button onClick={extract} disabled={extracting || !url.trim()}
                    style={{ ...meta(11, "#FFFFFF"), fontWeight: 700, background: C.ink, border: `1px solid ${C.ink}`, borderRadius: 2, padding: "0 18px", cursor: extracting || !url.trim() ? "default" : "pointer", opacity: extracting || !url.trim() ? 0.4 : 1 }}>
                    {extracting ? "…" : "Pull"}
                  </button>
                </div>
                {urlError && <p style={{ fontFamily: SANS, fontSize: 12.5, color: C.burgundy, margin: "8px 0 0" }}>{urlError}</p>}
              </div>

              {/* What she's recommending */}
              {product && (
                <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 14, alignItems: "center", paddingBottom: 18, marginBottom: 18, borderBottom: `1px solid ${C.rule}` }}>
                  <div style={{ aspectRatio: "4 / 5", background: C.well, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ProductImage url={product.image_url} fallback={<LinkIcon style={{ width: 18, height: 18, color: C.muted }} />} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <input value={product.brand} onChange={(e) => setProduct({ ...product, brand: e.target.value })} placeholder="Brand" style={{ ...field, padding: "8px 10px", fontSize: 13.5, fontWeight: 700 }} />
                    <input value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} placeholder="Product name" style={{ ...field, padding: "8px 10px", fontSize: 13.5 }} />
                  </div>
                </div>
              )}

              {/* The rest only once a product is attached */}
              {product && (
                <>
                  <div style={{ marginBottom: 18 }}>
                    <label style={label}>Your take</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {([["buy", "Would buy"], ["do_not_buy", "Wouldn't buy"]] as const).map(([val, lab]) => {
                        const on = recommendation === val;
                        return (
                          <button key={val} onClick={() => setRecommendation(val)}
                            style={{ ...meta(11.5, on ? "#FFFFFF" : C.ink), fontWeight: 700, padding: "14px 0", borderRadius: 2, cursor: "pointer", background: on ? C.ink : "transparent", border: `1px solid ${C.ink}` }}>
                            {lab}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ marginBottom: 18 }}>
                    <label style={label}>Why do you recommend this?</label>
                    <textarea value={reasoning} onChange={(e) => setReasoning(e.target.value)} rows={3} placeholder="What makes this a good pick for them?" style={{ ...field, resize: "none" }} />
                  </div>

                  <div style={{ marginBottom: 18 }}>
                    <label style={label}>Fit note{optional}</label>
                    <input value={fitNote} onChange={(e) => setFitNote(e.target.value)} placeholder="e.g. Runs big, size down" style={field} />
                  </div>

                  <div style={{ marginBottom: 22 }}>
                    <label style={label}>Who would this work for?{optional}</label>
                    <input value={whoFor} onChange={(e) => setWhoFor(e.target.value)} placeholder="e.g. Tall, long torso, smaller bust" style={field} />
                  </div>

                  <button onClick={doSubmit} disabled={!canSubmit}
                    style={{ width: "100%", ...meta(12, "#FFFFFF"), fontWeight: 700, letterSpacing: "0.16em", padding: "17px 0", borderRadius: 2, border: `1px solid ${C.burgundy}`, background: C.burgundy, cursor: canSubmit ? "pointer" : "default", opacity: canSubmit ? 1 : 0.4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    {submitting ? "Sharing…" : <><Check style={{ width: 15, height: 15 }} /> Share recommendation</>}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
