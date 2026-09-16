import { useState, useRef, useCallback, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { shouldShowFitPrompt } from "@/components/DialInFitModal";
import { imageToJpeg } from "@/lib/image";
import { useIsMobile } from "@/hooks/use-mobile";
import { C, RADIUS, SANS, body, display, hairline, meta, strong } from "@/lib/design";

type FlowStep = "input" | "extracting" | "preview" | "uncertainty" | "context" | "confidence" | "audience";

interface ExtractedProduct {
  brand: string;
  name: string;
  retailer: string;
  image_url: string | null;
  color: string | null;
  category: string | null;
  price: string | null;
  source_url: string | null;
  uploaded_image?: string | null; // base64 for display / upload
  uploaded_file?: File | null;
}

const CATEGORY_OPTIONS = ["Tops", "Bottoms", "Dresses", "Outerwear", "Shoes", "Bags", "Accessories"];

const normalizeCategory = (raw: string | null): string | null => {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (["top", "shirt", "blouse", "tank", "tee", "sweater", "sweatshirt", "hoodie", "crop", "knit", "cami"].some(k => s.includes(k))) return "Tops";
  if (["jean", "denim", "pant", "trouser", "short", "skirt", "legging", "bottom"].some(k => s.includes(k))) return "Bottoms";
  if (["dress", "gown", "maxi", "midi", "mini", "romper", "jumpsuit"].some(k => s.includes(k))) return "Dresses";
  if (["jacket", "coat", "blazer", "cardigan", "vest", "parka", "trench"].some(k => s.includes(k))) return "Outerwear";
  if (["shoe", "boot", "sneaker", "heel", "sandal", "loafer", "flat", "pump", "mule"].some(k => s.includes(k))) return "Shoes";
  if (["bag", "purse", "handbag", "tote", "clutch", "backpack", "crossbody"].some(k => s.includes(k))) return "Bags";
  if (["accessory", "belt", "scarf", "hat", "jewelry", "earring", "necklace", "bracelet", "ring"].some(k => s.includes(k))) return "Accessories";
  return null;
};

const UNCERTAINTY_OPTIONS = [
  "Will it fit right",
  "Will it flatter me",
  "Between sizes",
  "Worth the price",
  "How it will look on me",
  "Quality concerns",
  "Not sure about the color",
  "Hard to tell from photos",
  "Other",
];

// Stored only, for now. Nothing routes on these yet.
const AUDIENCE_OPTIONS = [
  "People with a similar body/fit",
  "People I follow",
  "People with similar style/taste",
  "Other",
];

const FOLLOWUP_UNCERTAINTIES = [
  "Will it fit right",
  "Will it flatter me",
  "How it will look on me",
  "Quality concerns",
  "Not sure about the color",
  "Hard to tell from photos",
];

// ── The editorial system, locally ─────────────────────────────────────────────
// Type, rules and square edges, per src/lib/design.ts. No pills, no cards, no
// shadows. Selected options are ink-filled with paper text; burgundy is kept
// for the primary action, the confidence pick and the step marker.

/** The steps the marker counts. "extracting" is part of step one. */
const STEP_ORDER: FlowStep[] = ["input", "preview", "uncertainty", "context", "confidence", "audience"];

const primaryBtn = (enabled: boolean): CSSProperties => ({
  ...meta(12, "#FFFFFF"),
  fontWeight: 700,
  letterSpacing: "0.16em",
  width: "100%",
  background: C.burgundy,
  border: `1px solid ${C.burgundy}`,
  borderRadius: RADIUS,
  padding: "15px 18px",
  cursor: enabled ? "pointer" : "default",
  opacity: enabled ? 1 : 0.35,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  transition: "opacity 0.15s",
});

const secondaryBtn = (enabled: boolean): CSSProperties => ({
  ...meta(11, C.ink),
  fontWeight: 700,
  letterSpacing: "0.16em",
  background: "transparent",
  border: `1px solid ${C.ink}`,
  borderRadius: RADIUS,
  padding: "0 18px",
  cursor: enabled ? "pointer" : "default",
  opacity: enabled ? 1 : 0.35,
  flexShrink: 0,
});

const textLink = (colour: string = C.ink): CSSProperties => ({
  ...meta(11, colour),
  fontWeight: 700,
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
});

// 16px on phones so iOS doesn't zoom into the field on focus.
const fieldStyle = (isMobile: boolean): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  borderRadius: RADIUS,
  border: `1px solid ${C.rule}`,
  background: "#FFFFFF",
  padding: "13px 14px",
  fontFamily: SANS,
  fontSize: isMobile ? 16 : 15,
  lineHeight: 1.5,
  color: C.ink,
  outline: "none",
  resize: "none",
});

/** A short selectable option: category, sizes. */
const chip = (on: boolean): CSSProperties => ({
  fontFamily: SANS,
  fontSize: 13.5,
  fontWeight: on ? 600 : 500,
  lineHeight: 1.2,
  color: on ? C.paper : C.ink,
  background: on ? C.ink : "transparent",
  border: `1px solid ${on ? C.ink : C.rule}`,
  borderRadius: RADIUS,
  padding: "10px 14px",
  cursor: "pointer",
  transition: "background 0.12s, color 0.12s, border-color 0.12s",
});

const ellipsis: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

const PAGE_CSS = `
.pd-field::placeholder, .pd-hero::placeholder { color: ${C.muted}; opacity: 1; }
.pd-field:focus { border-color: ${C.ink} !important; }
.pd-hero:focus { border-bottom-color: ${C.burgundy} !important; }
`;

function Masthead({ isMobile, onHome, onFeed }: { isMobile: boolean; onHome: () => void; onFeed: () => void }) {
  return (
    <header style={{ background: C.paper, borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8, padding: isMobile ? "14px 16px" : "20px 40px" }}>
        <button onClick={onFeed} style={{ ...textLink(C.ink), justifySelf: "start" }}>← Feed</button>
        <button
          onClick={onHome}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", userSelect: "none", fontFamily: SANS, textTransform: "uppercase", letterSpacing: isMobile ? "0.22em" : "0.32em", fontSize: isMobile ? 12 : 15, color: C.ink, whiteSpace: "nowrap" }}
        >
          <span style={{ fontWeight: 700 }}>ELEVEN</span>
          <span style={{ fontWeight: 300 }}>ELEVEN</span>
        </button>
        <span />
      </div>
    </header>
  );
}

function StepMark({ index, total }: { index: number; total: number }) {
  return (
    <div style={{ marginBottom: 30 }} aria-label={`Step ${index + 1} of ${total}`}>
      <div style={{ display: "flex", gap: 4 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 2, background: i <= index ? C.burgundy : C.rule, transition: "background 0.25s" }} />
        ))}
      </div>
      <p style={{ ...meta(10.5, C.ink), marginTop: 10 }}>Step {index + 1} / {total}</p>
    </div>
  );
}

/** The item she's deciding on, carried through the later steps. */
function MiniPreview({ image, brand, name }: { image: string | null; brand: string; name: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, paddingBottom: 18, marginBottom: 30, borderBottom: `1px solid ${C.rule}` }}>
      {image ? (
        <img src={image} alt={name} style={{ width: 48, height: 64, objectFit: "cover", background: C.well, flexShrink: 0, display: "block" }} />
      ) : (
        <div style={{ width: 48, height: 64, background: C.well, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {brand && <p style={{ ...strong(12.5), textTransform: "uppercase", letterSpacing: "0.05em", ...ellipsis }}>{brand}</p>}
        <p style={{ ...body(14, C.inkSoft), marginTop: brand ? 3 : 0, ...ellipsis }}>{name}</p>
      </div>
    </div>
  );
}

/** A long option as a full-width row, with a small square check on the right. */
function OptionRow({ label, on, first, onClick }: { label: string; on: boolean; first: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        textAlign: "left", background: "none", cursor: "pointer",
        borderLeft: "none", borderRight: "none",
        borderTop: first ? `1px solid ${C.rule}` : "none",
        borderBottom: `1px solid ${C.rule}`,
        borderRadius: 0,
        padding: "17px 0",
        fontFamily: SANS, fontSize: 15.5, lineHeight: 1.35, fontWeight: on ? 700 : 400, color: C.ink,
      }}
    >
      <span>{label}</span>
      <span
        aria-hidden
        style={{
          width: 18, height: 18, flexShrink: 0, boxSizing: "border-box",
          border: `1px solid ${on ? C.ink : C.faint}`, borderRadius: RADIUS,
          background: on ? C.ink : "transparent",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {on && <Check style={{ width: 12, height: 12, color: C.paper }} strokeWidth={3} />}
      </span>
    </button>
  );
}

const enter = {
  initial: { opacity: 0, x: 30 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
  transition: { duration: 0.3 },
};

const PostDecision = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [flowStep, setFlowStep] = useState<FlowStep>("input");
  // "Who would you especially like input from?" — captured to learn what women
  // pick. No matching or routing reads these yet, deliberately.
  const [inputFrom, setInputFrom] = useState<string[]>([]);
  const [inputFromOther, setInputFromOther] = useState("");
  const [product, setProduct] = useState<ExtractedProduct | null>(null);
  const [uncertainties, setUncertainties] = useState<string[]>([]);
  const [priceNote, setPriceNote] = useState("");
  const [sizesNote, setSizesNote] = useState<string[]>([]);
  const [contextNotes, setContextNotes] = useState<Record<string, string>>({});
  const [confidence, setConfidence] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  const needsContext = uncertainties.some(u =>
    u === "Worth the price" || u === "Between sizes" || u === "Other" || FOLLOWUP_UNCERTAINTIES.includes(u)
  );

  const [secondPhoto, setSecondPhoto] = useState<File | null>(null);
  const [secondPhotoPreview, setSecondPhotoPreview] = useState<string | null>(null);
  // Second option to compare (deciding between two): its own extracted image + live link.
  const [showSecondUrl, setShowSecondUrl] = useState(false);
  const [secondUrlInput, setSecondUrlInput] = useState("");
  const [extractingSecond, setExtractingSecond] = useState(false);
  const [secondUrlError, setSecondUrlError] = useState<string | null>(null);
  const [secondProduct, setSecondProduct] = useState<{ image_url: string | null; source_url: string; name: string; brand: string; category: string | null; price: string | null } | null>(null);

  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const secondPhotoInputRef = useRef<HTMLInputElement>(null);
  const [draggingOver, setDraggingOver] = useState(false);

  // ─── Resize image before sending to stay under edge function limits ───
  const resizeImage = (file: File): Promise<{ base64: string; dataUrl: string; blob: Blob }> =>
    new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 1024;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        canvas.toBlob((blob) => {
          resolve({ base64: dataUrl.split(",")[1], dataUrl, blob: blob! });
          URL.revokeObjectURL(objectUrl);
        }, "image/jpeg", 0.85);
      };
      img.src = objectUrl;
    });

  // ─── Shared file processor (used by input + drag-and-drop) ───────
  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setFlowStep("extracting");

    const { base64, dataUrl } = await resizeImage(file);

    try {
      const { data, error } = await supabase.functions.invoke("extract-product", {
        body: { imageBase64: base64, mediaType: "image/jpeg" },
      });
      console.log("extract-product response:", JSON.stringify(data), "error:", error);
      if (error) throw error;

      // If Claude found a source URL, fetch the clean product image from it via Microlink
      let cleanImageUrl: string | null = null;
      const sourceUrl: string | null = data.source_url ?? null;
      if (sourceUrl) {
        try {
          const mlRes = await fetch(
            `https://api.microlink.io/?url=${encodeURIComponent(sourceUrl)}&meta=true`
          );
          const mlData = await mlRes.json();
          if (mlData.status === "success" && mlData.data?.image?.url) {
            cleanImageUrl = mlData.data.image.url;
          }
        } catch {
          // Microlink failed — fall back to uploaded screenshot
        }
      }

      setProduct({
        brand: data.brand ?? "",
        name: data.name ?? "",
        retailer: data.retailer ?? "",
        image_url: cleanImageUrl,
        color: data.color ?? null,
        category: normalizeCategory(data.category) ?? data.category ?? null,
        price: data.price ? String(data.price) : null,
        source_url: sourceUrl,
        uploaded_image: dataUrl,
        uploaded_file: file,
      });
      if (data.price) setPriceNote(String(data.price).replace(/^\$/, ""));
    } catch {
      setProduct({
        brand: "",
        name: "",
        retailer: "",
        image_url: null,
        color: null,
        category: null,
        price: null,
        source_url: null,
        uploaded_image: dataUrl,
        uploaded_file: file,
      });
    }
    setFlowStep("preview");
  };

  // ─── File input change handler ────────────────────────────────────
  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  // ─── Drag-and-drop handlers ───────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDraggingOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // ─── URL submit handler ───────────────────────────────────────────
  const handleUrlSubmit = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setUrlError(null);

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    } catch {
      setUrlError("Please enter a valid product URL");
      return;
    }

    setFlowStep("extracting");
    try {
      const { data, error } = await supabase.functions.invoke("extract-product", {
        body: { url: parsedUrl.href },
      });
      if (error) throw error;

      setProduct({
        brand: data.brand ?? "",
        name: data.name ?? "",
        retailer: data.retailer ?? "",
        image_url: data.image_url ?? null,
        color: data.color ?? null,
        category: normalizeCategory(data.category) ?? normalizeCategory(data.name) ?? data.category ?? null,
        price: data.price ? String(data.price) : null,
        source_url: parsedUrl.href,
        uploaded_image: null,
        uploaded_file: null,
      });
      if (data.price) setPriceNote(String(data.price).replace(/^\$/, ""));
    } catch {
      setUrlError("Couldn't read that URL. Try a screenshot instead.");
      setFlowStep("input");
      return;
    }
    setFlowStep("preview");
  };

  const handleSecondPhotoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setSecondPhoto(file);
    setSecondPhotoPreview(URL.createObjectURL(file));
  }, []);

  // ─── Add a second option to compare (extract its image + keep its link) ───
  const handleSecondUrlSubmit = async () => {
    const trimmed = secondUrlInput.trim();
    if (!trimmed) return;
    let parsed: URL;
    try { parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`); }
    catch { setSecondUrlError("Enter a valid link"); return; }
    setSecondUrlError(null);
    setExtractingSecond(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-product", {
        body: { url: parsed.href },
      });
      if (error) throw error;
      const secondCategory = normalizeCategory(data.category) ?? normalizeCategory(data.name) ?? data.category ?? null;
      setSecondProduct({
        image_url: data.image_url ?? null,
        source_url: parsed.href,
        name: data.name ?? "",
        brand: data.brand ?? "",
        category: secondCategory,
        price: data.price ? `$${String(data.price).replace(/[^0-9.]/g, "")}` : null,
      });
      // If the first product didn't yield a category, fall back to this one's so the
      // decision still gets categorized (and the picker shows it filled).
      if (secondCategory) setProduct((p) => (p && !p.category ? { ...p, category: secondCategory } : p));
      setShowSecondUrl(false);
      setSecondUrlInput("");
    } catch {
      setSecondUrlError("Couldn't read that link. Try another.");
    } finally {
      setExtractingSecond(false);
    }
  };

  // ─── Submit decision ────────────────────────────────────────────
  const submitDecision = async () => {
    if (!product) return;
    setSubmitting(true);

    let finalImageUrl = product.image_url; // prefer clean Microlink image
    // The second image comes from a compared link (its extracted image) if present,
    // otherwise from a manually uploaded second photo.
    let finalImageUrl2: string | null = secondProduct?.image_url ?? null;

    // Only upload the raw screenshot if we don't already have a clean image URL
    if (product.uploaded_file && !product.image_url) {
      let body: Blob = product.uploaded_file;
      try { body = await imageToJpeg(product.uploaded_file); } catch (e) { console.warn("product image convert failed, uploading raw:", e); }
      const path = `${Date.now()}.jpg`;
      const { data: uploadData } = await supabase.storage
        .from("product-images")
        .upload(path, body, { upsert: true, contentType: "image/jpeg" });

      if (uploadData) {
        const { data: urlData } = supabase.storage
          .from("product-images")
          .getPublicUrl(uploadData.path);
        finalImageUrl = urlData.publicUrl;
      }
    }

    if (!finalImageUrl2 && secondPhoto) {
      let body2: Blob = secondPhoto;
      try { body2 = await imageToJpeg(secondPhoto); } catch (e) { console.warn("second photo convert failed, uploading raw:", e); }
      const path2 = `${Date.now()}_2.jpg`;
      const { data: uploadData2 } = await supabase.storage
        .from("product-images")
        .upload(path2, body2, { upsert: true, contentType: "image/jpeg" });

      if (uploadData2) {
        const { data: urlData2 } = supabase.storage
          .from("product-images")
          .getPublicUrl(uploadData2.path);
        finalImageUrl2 = urlData2.publicUrl;
      }
    }

    if (!user) {
      setSubmitting(false);
      navigate("/signin?mode=signup");
      return;
    }

    const { data: inserted } = await supabase.from("decisions").insert({
      user_id: user.id,
      product_name: product.name || null,
      brand_name: product.brand || null,
      product_image_url: finalImageUrl,
      product_image_url_2: finalImageUrl2 ?? null,
      product_url: product.source_url || null,
      product_url_2: secondProduct?.source_url ?? null,
      product_name_2: secondProduct?.name || null,
      brand_name_2: secondProduct?.brand || null,
      price_note_2: secondProduct?.price || null,
      product_category: product.category || secondProduct?.category || null,
      product_price: product.price ? (parseFloat(String(product.price).replace(/[^0-9.]/g, "")) || null) : null,
      confidence_score: confidence,
      uncertainty_text: uncertainties.join(", "),
      price_note: priceNote.trim() ? `$${priceNote.trim()}` : null,
      sizes_note: sizesNote.length > 0 ? sizesNote.join(", ") : null,
      context_note: Object.entries(contextNotes).filter(([,v]) => v.trim()).map(([k,v]) => `${k}: ${v.trim()}`).join(" · ") || null,
      input_from: inputFrom.length > 0 ? inputFrom : null,
      input_from_other: inputFrom.includes("Other") && inputFromOther.trim() ? inputFromOther.trim() : null,
      is_public: true,
    }).select("id").single();

    // Tell anyone following her that she posted. In-app only.
    if (inserted?.id) {
      supabase.functions
        .invoke("notify-followers", { body: { decision_id: inserted.id } })
        .catch((e) => console.warn("follower notify failed:", e));
    }

    setSubmitting(false);
    const showFit = user && shouldShowFitPrompt(user.id);
    navigate("/feed", { state: showFit ? { fitPromptVariant: "post_decision" } : undefined });
  };

  const toggleInputFrom = (opt: string) =>
    setInputFrom((prev) =>
      prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
    );

  const toggleUncertainty = (opt: string) =>
    setUncertainties((prev) =>
      prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
    );

  const displayImage = product?.uploaded_image ?? product?.image_url;

  const field = fieldStyle(isMobile);
  const heading: CSSProperties = { ...display(isMobile ? "clamp(34px, 10.5vw, 44px)" : 56), marginBottom: 14 };
  const lede: CSSProperties = { ...body(isMobile ? 15 : 16, C.inkSoft), marginBottom: isMobile ? 26 : 32 };
  const actions: CSSProperties = { marginTop: 36, display: "flex", flexDirection: "column", gap: 20 };
  const back: CSSProperties = { ...textLink(C.muted), alignSelf: "center" };
  const sectionTitle: CSSProperties = { ...strong(14), textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.35 };
  const section = (first: boolean): CSSProperties => ({ paddingTop: first ? 0 : 24, borderTop: first ? "none" : `1px solid ${C.rule}` });
  const sizeLabel: CSSProperties = { ...meta(10.5, C.muted), marginBottom: 10 };
  const errorText: CSSProperties = { ...body(13.5, C.burgundy), marginTop: 8 };

  // Step marker, derived from the existing flow. Context only counts when it
  // will be shown (it's always shown today: every concern asks for detail).
  const steps = STEP_ORDER.filter((s) => s !== "context" || needsContext || uncertainties.length === 0);
  const stepIndex = Math.max(0, steps.indexOf(flowStep === "extracting" ? "input" : flowStep));

  const mini = product ? (
    <MiniPreview image={displayImage ?? null} brand={product.brand || product.retailer} name={product.name || "Unnamed item"} />
  ) : null;

  const toggleSize = (s: string) =>
    setSizesNote((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : prev.length < 2 ? [...prev, s] : prev
    );

  const sizeChips = (sizes: string[], keyPrefix: string) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {sizes.map((s) => (
        <button key={`${keyPrefix}${s}`} onClick={() => toggleSize(s)} aria-pressed={sizesNote.includes(s)} style={{ ...chip(sizesNote.includes(s)), minWidth: 48, padding: "10px 12px" }}>
          {s}
        </button>
      ))}
    </div>
  );

  // Main photo slot: a touch smaller on desktop once a second photo sits beside it.
  const imgW = secondPhotoPreview && !isMobile ? 96 : 120;
  const imgH = 160;
  const emptySlot = (w: number): CSSProperties => ({
    width: w, height: imgH, boxSizing: "border-box", flexShrink: 0,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
    background: "transparent", border: `1px solid ${C.rule}`, borderRadius: RADIUS, cursor: "pointer",
    ...meta(10.5, C.ink), fontWeight: 700, textAlign: "center", padding: 8,
  });

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: SANS, display: "flex", flexDirection: "column" }}>
      <style>{PAGE_CSS}</style>
      <Masthead isMobile={isMobile} onHome={() => navigate("/", { state: { home: true } })} onFeed={() => navigate("/feed")} />

      <main style={{ flex: 1, width: "100%", maxWidth: 640, margin: "0 auto", boxSizing: "border-box", padding: isMobile ? "24px 20px 72px" : "56px 24px 96px" }}>
        <StepMark index={stepIndex} total={steps.length} />

        <AnimatePresence mode="wait">

          {/* ── STEP 1: INPUT ── */}
          {flowStep === "input" && (
            <motion.div key="input" {...enter}>
              <h1 style={heading}>What are you considering?</h1>
              <p style={lede}>Paste the product link and we'll pull everything automatically.</p>

              {/* ── URL input (primary) ── */}
              <input
                type="url"
                className="pd-hero"
                placeholder="Paste product URL here"
                value={urlInput}
                onChange={(e) => { setUrlInput(e.target.value); setUrlError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
                style={{
                  width: "100%", boxSizing: "border-box",
                  borderTop: "none", borderLeft: "none", borderRight: "none", borderBottom: `1px solid ${C.ink}`, borderRadius: 0,
                  background: "transparent", padding: "8px 0 12px",
                  fontFamily: SANS, fontSize: isMobile ? 20 : 26, color: C.ink, outline: "none",
                }}
              />

              {urlError && <p style={{ ...errorText, marginTop: 10 }}>{urlError}</p>}

              <button onClick={handleUrlSubmit} disabled={!urlInput.trim()} style={{ ...primaryBtn(!!urlInput.trim()), marginTop: 22 }}>
                Get input on this
              </button>

              {/* ── Screenshot fallback ── */}
              <div style={{ marginTop: 44 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                  <div style={{ ...hairline(), flex: 1 }} />
                  <span style={{ ...meta(10.5, C.muted), whiteSpace: "nowrap" }}>or upload a screenshot</span>
                  <div style={{ ...hairline(), flex: 1 }} />
                </div>

                <input
                  ref={screenshotInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleScreenshotUpload}
                />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => screenshotInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); screenshotInputRef.current?.click(); } }}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: isMobile ? "30px 16px" : "40px 16px",
                    border: `1px solid ${draggingOver ? C.ink : C.rule}`, borderRadius: RADIUS,
                    background: draggingOver ? "#FFFFFF" : "transparent",
                    cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  <span style={{ ...meta(11, draggingOver ? C.burgundy : C.ink), fontWeight: 700, textAlign: "center" }}>
                    {draggingOver ? "Drop to upload" : "Drag & drop or click to upload"}
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── STEP 2: EXTRACTING ── */}
          {flowStep === "extracting" && (
            <motion.div key="extracting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ paddingTop: isMobile ? 40 : 64, paddingBottom: 64 }}>
              <p style={{ ...meta(11, C.ink), fontWeight: 700 }}>Detecting product...</p>
              <div style={{ position: "relative", height: 2, background: C.rule, overflow: "hidden", margin: "16px 0 14px" }}>
                <motion.div
                  style={{ position: "absolute", top: 0, left: 0, height: "100%", width: "40%", background: C.burgundy }}
                  animate={{ x: ["-100%", "250%"] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
              <p style={body(14, C.muted)}>This takes a few seconds</p>
            </motion.div>
          )}

          {/* ── STEP 3: PREVIEW ── */}
          {flowStep === "preview" && product && (
            <motion.div key="preview" {...enter}>
              <h1 style={heading}>{product.name ? "Does this look right?" : "Almost there"}</h1>
              <p style={lede}>
                {product.name ? "Edit anything that's off." : "We got the brand. Just add the item name and a photo."}
              </p>

              <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 20 : 24, marginBottom: 32 }}>
                {/* Image(s) */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "flex-start" }}>
                  <div>
                    {displayImage ? (
                      <img
                        src={displayImage}
                        alt="Product"
                        style={{ width: imgW, height: imgH, objectFit: "cover", background: C.well, display: "block" }}
                      />
                    ) : (
                      <button onClick={() => screenshotInputRef.current?.click()} style={emptySlot(imgW)}>
                        <span style={{ fontSize: 20, fontWeight: 300, letterSpacing: 0, lineHeight: 1 }}>+</span>
                        Add photo
                      </button>
                    )}
                    {displayImage && (
                      <button onClick={() => screenshotInputRef.current?.click()} aria-label="Replace photo" style={{ ...textLink(C.ink), marginTop: 9, fontSize: 10 }}>
                        Replace
                      </button>
                    )}
                    <input ref={screenshotInputRef} type="file" accept="image/*" className="hidden" onChange={handleScreenshotUpload} />
                  </div>

                  {displayImage && !secondPhotoPreview && (
                    <button onClick={() => secondPhotoInputRef.current?.click()} style={emptySlot(72)}>
                      + photo
                    </button>
                  )}

                  {secondPhotoPreview && (
                    <div>
                      <img
                        src={secondPhotoPreview}
                        alt="Second photo"
                        style={{ width: imgW, height: imgH, objectFit: "cover", background: C.well, display: "block" }}
                      />
                      <button
                        onClick={() => { setSecondPhoto(null); setSecondPhotoPreview(null); }}
                        aria-label="Remove second photo"
                        style={{ ...textLink(C.muted), marginTop: 9, fontSize: 10 }}
                      >
                        Remove
                      </button>
                    </div>
                  )}

                  <input ref={secondPhotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleSecondPhotoSelect} />
                </div>

                {/* Editable fields */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    className="pd-field"
                    value={product.name}
                    onChange={(e) => setProduct({ ...product, name: e.target.value })}
                    placeholder="Item name"
                    style={field}
                  />
                  <input
                    className="pd-field"
                    value={product.brand}
                    onChange={(e) => setProduct({ ...product, brand: e.target.value })}
                    placeholder="Brand"
                    style={field}
                  />
                  <div>
                    <div style={{ position: "relative" }}>
                      <span style={{ ...body(isMobile ? 16 : 15, C.muted), position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>$</span>
                      <input
                        className="pd-field"
                        value={priceNote}
                        onChange={(e) => setPriceNote(e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder="Price"
                        style={{ ...field, paddingLeft: 28 }}
                      />
                    </div>
                    {!priceNote && (
                      <p style={{ ...body(12.5, C.muted), marginTop: 6 }}>Couldn't detect price. Enter it manually.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Compare a second option (deciding between two) */}
              <div style={{ marginBottom: 32 }}>
                {secondProduct ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderTop: `1px solid ${C.rule}`, borderBottom: `1px solid ${C.rule}` }}>
                    {secondProduct.image_url ? (
                      <img src={secondProduct.image_url} alt="Second option" style={{ width: 44, height: 58, objectFit: "cover", background: C.well, flexShrink: 0, display: "block" }} />
                    ) : (
                      <div style={{ width: 44, height: 58, background: C.well, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={meta(10, C.muted)}>Comparing with</p>
                      <p style={{ ...body(14.5, C.ink), marginTop: 3, ...ellipsis }}>{[secondProduct.brand, secondProduct.name].filter(Boolean).join(" ") || secondProduct.source_url}</p>
                    </div>
                    <button
                      onClick={() => setSecondProduct(null)}
                      aria-label="Remove second option"
                      style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: C.muted, fontFamily: SANS, fontSize: 16, lineHeight: 1, padding: "6px 4px" }}
                    >
                      ✕
                    </button>
                  </div>
                ) : showSecondUrl ? (
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                      <input
                        type="url"
                        className="pd-field"
                        value={secondUrlInput}
                        onChange={(e) => { setSecondUrlInput(e.target.value); setSecondUrlError(null); }}
                        onKeyDown={(e) => e.key === "Enter" && handleSecondUrlSubmit()}
                        placeholder="Paste the other product link"
                        autoFocus
                        style={{ ...field, flex: 1, minWidth: 0 }}
                      />
                      <button
                        onClick={handleSecondUrlSubmit}
                        disabled={extractingSecond || !secondUrlInput.trim()}
                        style={secondaryBtn(!extractingSecond && !!secondUrlInput.trim())}
                      >
                        {extractingSecond ? "…" : "Add"}
                      </button>
                    </div>
                    {secondUrlError && <p style={errorText}>{secondUrlError}</p>}
                  </div>
                ) : (
                  <button
                    onClick={() => setShowSecondUrl(true)}
                    style={{ ...body(14.5, C.ink), background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                  >
                    Deciding between two?{" "}
                    <span style={{ color: C.burgundy, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3, textDecorationThickness: 1 }}>Add the other link</span>
                  </button>
                )}
              </div>

              {/* Category picker */}
              <div>
                <p style={{ ...meta(11, C.ink), marginBottom: 12 }}>Category</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {CATEGORY_OPTIONS.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setProduct({ ...product, category: product.category === cat ? null : cat })}
                      aria-pressed={product.category === cat}
                      style={chip(product.category === cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div style={actions}>
                <button
                  onClick={() => setFlowStep("uncertainty")}
                  disabled={!product.name.trim() && !product.brand.trim()}
                  style={primaryBtn(!!(product.name.trim() || product.brand.trim()))}
                >
                  Looks good, continue
                </button>
                <button
                  onClick={() => { setProduct(null); setUrlInput(""); setUrlError(null); setFlowStep("input"); }}
                  style={back}
                >
                  Start over
                </button>
              </div>
            </motion.div>
          )}

          {/* ── STEP 4: UNCERTAINTY ── */}
          {flowStep === "uncertainty" && product && (
            <motion.div key="uncertainty" {...enter}>
              {mini}

              <h1 style={heading}>What are you unsure about?</h1>
              <p style={lede}>Select all that apply.</p>

              <div>
                {UNCERTAINTY_OPTIONS.map((opt, i) => (
                  <OptionRow key={opt} label={opt} first={i === 0} on={uncertainties.includes(opt)} onClick={() => toggleUncertainty(opt)} />
                ))}
              </div>

              <div style={actions}>
                <button
                  onClick={() => setFlowStep(needsContext ? "context" : "confidence")}
                  disabled={uncertainties.length === 0}
                  style={primaryBtn(uncertainties.length > 0)}
                >
                  Continue
                </button>
                <button onClick={() => setFlowStep("preview")} style={back}>
                  ← Back
                </button>
              </div>
            </motion.div>
          )}

          {/* ── STEP 4b: CONTEXT ── */}
          {flowStep === "context" && product && (
            <motion.div key="context" {...enter}>
              <h1 style={heading}>Tell us more</h1>
              <p style={lede}>The more specific you are, the better the input you'll get.</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
                {uncertainties.includes("Worth the price") && (
                  <div style={section(true)}>
                    <p style={{ ...sectionTitle, marginBottom: 12 }}>What's the price?</p>
                    <div style={{ position: "relative" }}>
                      <span style={{ ...body(isMobile ? 16 : 15, C.muted), position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>$</span>
                      <input
                        className="pd-field"
                        value={priceNote}
                        onChange={(e) => setPriceNote(e.target.value.replace(/^\$/, ""))}
                        placeholder="120"
                        style={{ ...field, paddingLeft: 28 }}
                      />
                    </div>
                  </div>
                )}

                {uncertainties.includes("Between sizes") && (
                  <div style={section(!uncertainties.includes("Worth the price"))}>
                    <p style={{ ...sectionTitle, marginBottom: 4 }}>Which sizes are you deciding between?</p>
                    <p style={{ ...body(14, C.muted), marginBottom: 18 }}>Select at least 2</p>

                    {product?.category === "Shoes" ? (
                      <>
                        <p style={sizeLabel}>US sizes</p>
                        {sizeChips(["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "12.5", "13", "13.5", "14"], "us")}
                        <p style={{ ...sizeLabel, marginTop: 20 }}>EU sizes</p>
                        {sizeChips(["35", "35.5", "36", "36.5", "37", "37.5", "38", "38.5", "39", "39.5", "40", "40.5", "41", "41.5", "42", "42.5", "43", "43.5", "44", "44.5", "45", "46", "47"], "eu")}
                      </>
                    ) : (
                      <>
                        <p style={sizeLabel}>Letter sizes</p>
                        {sizeChips(["XXS", "XS", "S", "M", "L", "XL", "XXL", "1X", "2X", "3X", "4X"], "")}
                        <p style={{ ...sizeLabel, marginTop: 20 }}>Number sizes</p>
                        {sizeChips(["00", "0", "2", "4", "6", "8", "10", "12", "14", "16", "18", "20", "22", "24"], "")}
                        <p style={{ ...sizeLabel, marginTop: 20 }}>Waist sizes</p>
                        {sizeChips(["23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "36", "38", "40"], "w")}
                      </>
                    )}

                    <div style={{ marginTop: 24 }}>
                      <p style={{ ...strong(14.5), marginBottom: 8 }}>
                        Anything making you unsure? <span style={{ fontWeight: 400, color: C.muted }}>(optional)</span>
                      </p>
                      <textarea
                        className="pd-field"
                        value={contextNotes["Between sizes"] ?? ""}
                        onChange={(e) => setContextNotes((prev) => ({ ...prev, ["Between sizes"]: e.target.value }))}
                        placeholder="e.g. I'm usually a 7 but this brand runs small, and I have wide feet"
                        rows={2}
                        style={field}
                      />
                    </div>
                  </div>
                )}

                {uncertainties.filter(u => u !== "Between sizes" && u !== "Other").map((u, i) => (
                  <div key={u} style={section(i === 0 && !uncertainties.includes("Worth the price") && !uncertainties.includes("Between sizes"))}>
                    <p style={sectionTitle}>{u}</p>
                    <p style={{ ...body(14, C.muted), marginTop: 4, marginBottom: 10 }}>What specifically are you unsure about?</p>
                    <textarea
                      className="pd-field"
                      value={contextNotes[u] ?? ""}
                      onChange={(e) => setContextNotes(prev => ({ ...prev, [u]: e.target.value }))}
                      placeholder="Be specific. This helps others give you real input..."
                      rows={2}
                      style={field}
                    />
                  </div>
                ))}

                {uncertainties.includes("Other") && (
                  <div style={section(uncertainties.length === 1)}>
                    <p style={{ ...sectionTitle, marginBottom: 10 }}>What else are you unsure about?</p>
                    <textarea
                      className="pd-field"
                      value={contextNotes["Other"] ?? ""}
                      onChange={(e) => setContextNotes(prev => ({ ...prev, Other: e.target.value }))}
                      placeholder="Describe what's holding you back..."
                      rows={3}
                      style={field}
                    />
                  </div>
                )}
              </div>

              <div style={actions}>
                <button
                  onClick={() => setFlowStep("confidence")}
                  disabled={uncertainties.includes("Between sizes") && sizesNote.length < 2}
                  style={primaryBtn(!(uncertainties.includes("Between sizes") && sizesNote.length < 2))}
                >
                  Continue
                </button>
                <button onClick={() => setFlowStep("uncertainty")} style={back}>
                  ← Back
                </button>
              </div>
            </motion.div>
          )}

          {/* ── STEP 5: CONFIDENCE ── */}
          {flowStep === "confidence" && product && (
            <motion.div key="confidence" {...enter}>
              {mini}

              <h1 style={heading}>How confident are you right now?</h1>
              <p style={lede}>1 = not at all · 10 = very confident</p>

              <div style={{ display: "flex", gap: isMobile ? 4 : 6 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
                  const on = confidence === n;
                  return (
                    <button
                      key={n}
                      onClick={() => setConfidence(n)}
                      aria-pressed={on}
                      style={{
                        flex: 1, minWidth: 0, height: isMobile ? 46 : 54, padding: 0,
                        borderRadius: RADIUS, border: `1px solid ${on ? C.burgundy : C.rule}`,
                        background: on ? C.burgundy : "transparent", color: on ? "#FFFFFF" : C.ink,
                        fontFamily: SANS, fontSize: 15, fontWeight: on ? 700 : 500, cursor: "pointer",
                        transition: "background 0.12s, color 0.12s, border-color 0.12s",
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
                <span style={meta(10, C.muted)}>Not confident</span>
                <span style={meta(10, C.muted)}>Very confident</span>
              </div>

              <div style={actions}>
                <button onClick={() => setFlowStep("audience")} style={primaryBtn(true)}>
                  Continue
                </button>
                <button onClick={() => setFlowStep("uncertainty")} style={back}>
                  ← Back
                </button>
              </div>
            </motion.div>
          )}

          {/* ── STEP 6: WHO SHOULD WEIGH IN (optional) ── */}
          {flowStep === "audience" && product && (
            <motion.div key="audience" {...enter}>
              {mini}

              <h1 style={heading}>Who would you especially like input from?</h1>
              <p style={lede}>Optional (select all that apply)</p>

              <div>
                {AUDIENCE_OPTIONS.map((opt, i) => (
                  <OptionRow key={opt} label={opt} first={i === 0} on={inputFrom.includes(opt)} onClick={() => toggleInputFrom(opt)} />
                ))}
              </div>

              {inputFrom.includes("Other") && (
                <input
                  type="text"
                  className="pd-field"
                  value={inputFromOther}
                  onChange={(e) => setInputFromOther(e.target.value)}
                  placeholder="Who would you like to hear from?"
                  style={{ ...field, marginTop: 16 }}
                />
              )}

              <p style={{ ...body(13.5, C.muted), marginTop: 18 }}>
                We'll use this to help connect your decision with relevant people.
              </p>

              <div style={actions}>
                <button onClick={submitDecision} disabled={submitting} style={primaryBtn(!submitting)}>
                  {submitting ? "Posting..." : "Post & get input"}
                </button>
                <button onClick={() => setFlowStep("confidence")} style={back}>
                  ← Back
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
};

export default PostDecision;
