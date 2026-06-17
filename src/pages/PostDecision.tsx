import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Loader2, ImageIcon, Link } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { shouldShowFitPrompt } from "@/components/DialInFitModal";
import { imageToJpeg } from "@/lib/image";

type FlowStep = "input" | "extracting" | "preview" | "uncertainty" | "context" | "confidence";

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

const FOLLOWUP_UNCERTAINTIES = [
  "Will it fit right",
  "Will it flatter me",
  "How it will look on me",
  "Quality concerns",
  "Not sure about the color",
  "Hard to tell from photos",
];

const PostDecision = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [flowStep, setFlowStep] = useState<FlowStep>("input");
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
      setUrlError("Couldn't read that URL — try a screenshot instead");
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

  // ─── Submit decision ────────────────────────────────────────────
  const submitDecision = async () => {
    if (!product) return;
    setSubmitting(true);

    let finalImageUrl = product.image_url; // prefer clean Microlink image
    let finalImageUrl2: string | null = null;

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

    if (secondPhoto) {
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
      navigate("/signin");
      return;
    }

    await supabase.from("decisions").insert({
      user_id: user.id,
      product_name: product.name || null,
      brand_name: product.brand || null,
      product_image_url: finalImageUrl,
      product_image_url_2: finalImageUrl2 ?? null,
      product_url: product.source_url || null,
      product_category: product.category || null,
      product_price: product.price ? (parseFloat(String(product.price).replace(/[^0-9.]/g, "")) || null) : null,
      confidence_score: confidence,
      uncertainty_text: uncertainties.join(", "),
      price_note: priceNote.trim() ? `$${priceNote.trim()}` : null,
      sizes_note: sizesNote.length > 0 ? sizesNote.join(", ") : null,
      context_note: Object.entries(contextNotes).filter(([,v]) => v.trim()).map(([k,v]) => `${k}: ${v.trim()}`).join(" · ") || null,
      is_public: true,
    });

    setSubmitting(false);
    const showFit = user && shouldShowFitPrompt(user.id);
    navigate("/feed", { state: showFit ? { fitPromptVariant: "post_decision" } : undefined });
  };

  const toggleUncertainty = (opt: string) =>
    setUncertainties((prev) =>
      prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
    );

  const displayImage = product?.uploaded_image ?? product?.image_url;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <span onClick={() => navigate("/")} style={{ letterSpacing: "0.32em", fontSize: 18, color: "#1C1712", cursor: "pointer" }}>
          <span style={{ fontWeight: 700 }}>ELEVEN</span><span style={{ fontWeight: 300 }}>ELEVEN</span>
        </span>
      </div>

      <div className="flex-1 px-6 py-8 max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">

          {/* ── STEP 1: INPUT ── */}
          {flowStep === "input" && (
            <motion.div key="input" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }}>
              <h2 className="font-sans text-3xl md:text-4xl font-light text-foreground mb-2">
                What are you considering?
              </h2>
              <p className="text-muted-foreground text-base mb-8">
                Paste the product link and we'll pull everything automatically.
              </p>

              {/* ── URL input (primary) ── */}
              <div
                className="w-full rounded-2xl border border-border overflow-hidden mb-3"
                style={{ background: "white" }}
              >
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <Link className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <input
                    type="url"
                    placeholder="Paste product URL here"
                    value={urlInput}
                    onChange={(e) => { setUrlInput(e.target.value); setUrlError(null); }}
                    onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
                    className="flex-1 bg-transparent outline-none text-base text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              {urlError && (
                <p className="text-sm text-red-500 mb-3 px-1">{urlError}</p>
              )}

              <button
                onClick={handleUrlSubmit}
                disabled={!urlInput.trim()}
                className="w-full py-3.5 rounded-2xl text-base font-semibold transition-opacity disabled:opacity-40"
                style={{
                  background: "#1C1712",
                  color: "white",
                }}
              >
                Get input on this
              </button>

              {/* ── Screenshot fallback ── */}
              <div className="mt-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-sm text-muted-foreground">or upload a screenshot</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <input
                  ref={screenshotInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleScreenshotUpload}
                />
                <div
                  onClick={() => screenshotInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-2xl border-2 border-dashed transition-colors cursor-pointer"
                  style={{
                    borderColor: draggingOver ? "#1C1712" : undefined,
                    background: draggingOver ? "rgba(28,23,18,0.04)" : undefined,
                  }}
                >
                  <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  <span className="text-base text-muted-foreground font-medium">
                    {draggingOver ? "Drop to upload" : "Drag & drop or click to upload"}
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── STEP 2: EXTRACTING ── */}
          {flowStep === "extracting" && (
            <motion.div key="extracting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="font-sans text-2xl font-light text-foreground">Detecting product...</p>
              <p className="text-base text-muted-foreground">This takes a few seconds</p>
            </motion.div>
          )}

          {/* ── STEP 3: PREVIEW ── */}
          {flowStep === "preview" && product && (
            <motion.div key="preview" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }}>
              <h2 className="font-sans text-3xl font-light text-foreground mb-2">
                {product.name ? "Does this look right?" : "Almost there"}
              </h2>
              <p className="text-muted-foreground text-base mb-6">
                {product.name ? "Edit anything that's off." : "We got the brand — just add the item name and a photo."}
              </p>

              <div className="flex gap-4 mb-6">
                {/* Image(s) */}
                <div className="flex-shrink-0 flex gap-2">
                  <div className="relative">
                    {displayImage ? (
                      <img
                        src={displayImage}
                        alt="Product"
                        className="rounded-xl object-cover bg-muted"
                        style={{ width: secondPhotoPreview ? 72 : 96, height: 128 }}
                      />
                    ) : (
                      <button
                        onClick={() => screenshotInputRef.current?.click()}
                        className="w-24 h-32 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 hover:border-accent transition-colors"
                      >
                        <Upload className="w-5 h-5 text-muted-foreground" />
                        <span className="text-base text-muted-foreground text-center">Add photo</span>
                      </button>
                    )}
                    {displayImage && (
                      <button
                        onClick={() => screenshotInputRef.current?.click()}
                        className="absolute -bottom-2 -right-2 bg-background border border-border rounded-full p-1.5 hover:bg-muted transition-colors"
                      >
                        <Upload className="w-3 h-3 text-muted-foreground" />
                      </button>
                    )}
                    <input ref={screenshotInputRef} type="file" accept="image/*" className="hidden" onChange={handleScreenshotUpload} />
                  </div>

                  {displayImage && !secondPhotoPreview && (
                    <button
                      onClick={() => secondPhotoInputRef.current?.click()}
                      className="w-16 h-32 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 hover:border-accent transition-colors"
                    >
                      <Upload className="w-4 h-4 text-muted-foreground" />
                      <span className="text-base text-muted-foreground text-center leading-tight">+ photo</span>
                    </button>
                  )}

                  {secondPhotoPreview && (
                    <div className="relative">
                      <img
                        src={secondPhotoPreview}
                        alt="Second photo"
                        className="rounded-xl object-cover bg-muted"
                        style={{ width: 72, height: 128 }}
                      />
                      <button
                        onClick={() => { setSecondPhoto(null); setSecondPhotoPreview(null); }}
                        className="absolute -top-2 -right-2 bg-background border border-border rounded-full p-1 hover:bg-muted transition-colors"
                        style={{ lineHeight: 1 }}
                      >
                        <span className="text-base text-muted-foreground">✕</span>
                      </button>
                    </div>
                  )}

                  <input ref={secondPhotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleSecondPhotoSelect} />
                </div>

                {/* Editable fields */}
                <div className="flex-1 space-y-2">
                  <input
                    value={product.name}
                    onChange={(e) => setProduct({ ...product, name: e.target.value })}
                    placeholder="Item name"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-card text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent"
                  />
                  <input
                    value={product.brand}
                    onChange={(e) => setProduct({ ...product, brand: e.target.value })}
                    placeholder="Brand"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-card text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent"
                  />
                  <div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground">$</span>
                      <input
                        value={priceNote}
                        onChange={(e) => setPriceNote(e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder="Price"
                        className="w-full pl-6 pr-3 py-2 rounded-lg border border-border bg-card text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent"
                      />
                    </div>
                    {!priceNote && (
                      <p className="text-xs text-muted-foreground mt-1 pl-1">Couldn't detect price — enter it manually</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Category picker */}
              <div className="mb-6">
                <p className="text-base text-muted-foreground mb-2 tracking-wide uppercase" style={{ letterSpacing: "0.1em" }}>Category</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_OPTIONS.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setProduct({ ...product, category: product.category === cat ? null : cat })}
                      className={`pill-button ${product.category === cat ? "active" : ""}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setFlowStep("uncertainty")}
                disabled={!product.name.trim() && !product.brand.trim()}
                className="w-full text-base tracking-[0.18em] uppercase font-medium disabled:opacity-30 transition-all" style={{ background: "#1C1712", color: "#FDFAF6", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 2px 12px rgba(0,0,0,0.22)", padding: "16px 0" }}
              >
                Looks good — continue
              </button>
              <button
                onClick={() => { setProduct(null); setUrlInput(""); setUrlError(null); setFlowStep("input"); }}
                className="w-full mt-3 text-center text-base text-muted-foreground hover:text-foreground transition-colors"
              >
                Start over
              </button>
            </motion.div>
          )}

          {/* ── STEP 4: UNCERTAINTY ── */}
          {flowStep === "uncertainty" && product && (
            <motion.div key="uncertainty" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }}>
              {/* Product mini preview */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border mb-8">
                {displayImage ? (
                  <img src={displayImage} alt={product.name} className="w-12 h-14 rounded-lg object-cover bg-muted flex-shrink-0" />
                ) : (
                  <div className="w-12 h-14 rounded-lg bg-muted flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium text-foreground truncate">{product.name || "Unnamed item"}</p>
                  <p className="text-base text-muted-foreground">{product.brand || product.retailer}</p>
                </div>
              </div>

              <h2 className="font-sans text-3xl md:text-4xl font-light text-foreground mb-2">
                What are you unsure about?
              </h2>
              <p className="text-muted-foreground text-base mb-8">Select all that apply.</p>

              <div className="flex flex-wrap gap-3">
                {UNCERTAINTY_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => toggleUncertainty(opt)}
                    className={`pill-button ${uncertainties.includes(opt) ? "active" : ""}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>

              <div className="mt-8">
                <button
                  onClick={() => setFlowStep(needsContext ? "context" : "confidence")}
                  disabled={uncertainties.length === 0}
                  className="w-full text-base tracking-[0.18em] uppercase font-medium disabled:opacity-30 transition-all" style={{ background: "#1C1712", color: "#FDFAF6", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 2px 12px rgba(0,0,0,0.22)", padding: "16px 0" }}
                >
                  Continue
                </button>
                <button
                  onClick={() => setFlowStep("preview")}
                  className="w-full mt-3 text-center text-base text-muted-foreground hover:text-foreground transition-colors"
                >
                  Back
                </button>
              </div>
            </motion.div>
          )}

          {/* ── STEP 4b: CONTEXT ── */}
          {flowStep === "context" && product && (
            <motion.div key="context" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }}>
              <h2 className="font-sans text-3xl font-light text-foreground mb-2">
                Tell us more
              </h2>
              <p className="text-muted-foreground text-base mb-8">
                The more specific you are, the better the input you'll get.
              </p>

              <div className="space-y-6">
                {uncertainties.includes("Worth the price") && (
                  <div>
                    <p className="text-base font-medium text-foreground mb-3">What's the price?</p>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base text-muted-foreground pointer-events-none">$</span>
                      <input
                        value={priceNote}
                        onChange={(e) => setPriceNote(e.target.value.replace(/^\$/, ""))}
                        placeholder="120"
                        className="w-full pl-7 pr-4 py-3 rounded-xl border border-border bg-card text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                )}

                {uncertainties.includes("Between sizes") && (
                  <div>
                    <p className="text-base font-medium text-foreground mb-1">Which sizes are you deciding between?</p>
                    <p className="text-base text-muted-foreground mb-3">Select at least 2</p>

                    {product?.category === "Shoes" ? (
                      <>
                        <p className="text-base font-semibold text-muted-foreground uppercase tracking-wider mb-2">US sizes</p>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "12.5", "13", "13.5", "14"].map((s) => (
                            <button
                              key={`us${s}`}
                              onClick={() => setSizesNote((prev) =>
                                prev.includes(s) ? prev.filter((x) => x !== s) : prev.length < 2 ? [...prev, s] : prev
                              )}
                              className={`pill-button ${sizesNote.includes(s) ? "active" : ""}`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                        <p className="text-base font-semibold text-muted-foreground uppercase tracking-wider mb-2">EU sizes</p>
                        <div className="flex flex-wrap gap-2">
                          {["35", "35.5", "36", "36.5", "37", "37.5", "38", "38.5", "39", "39.5", "40", "40.5", "41", "41.5", "42", "42.5", "43", "43.5", "44", "44.5", "45", "46", "47"].map((s) => (
                            <button
                              key={`eu${s}`}
                              onClick={() => setSizesNote((prev) =>
                                prev.includes(s) ? prev.filter((x) => x !== s) : prev.length < 2 ? [...prev, s] : prev
                              )}
                              className={`pill-button ${sizesNote.includes(s) ? "active" : ""}`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-base font-semibold text-muted-foreground uppercase tracking-wider mb-2">Letter sizes</p>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {["XXS", "XS", "S", "M", "L", "XL", "XXL", "1X", "2X", "3X", "4X"].map((s) => (
                            <button
                              key={s}
                              onClick={() => setSizesNote((prev) =>
                                prev.includes(s) ? prev.filter((x) => x !== s) : prev.length < 2 ? [...prev, s] : prev
                              )}
                              className={`pill-button ${sizesNote.includes(s) ? "active" : ""}`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                        <p className="text-base font-semibold text-muted-foreground uppercase tracking-wider mb-2">Number sizes</p>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {["00", "0", "2", "4", "6", "8", "10", "12", "14", "16", "18", "20", "22", "24"].map((s) => (
                            <button
                              key={s}
                              onClick={() => setSizesNote((prev) =>
                                prev.includes(s) ? prev.filter((x) => x !== s) : prev.length < 2 ? [...prev, s] : prev
                              )}
                              className={`pill-button ${sizesNote.includes(s) ? "active" : ""}`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                        <p className="text-base font-semibold text-muted-foreground uppercase tracking-wider mb-2">Waist sizes</p>
                        <div className="flex flex-wrap gap-2">
                          {["23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "36", "38", "40"].map((s) => (
                            <button
                              key={`w${s}`}
                              onClick={() => setSizesNote((prev) =>
                                prev.includes(s) ? prev.filter((x) => x !== s) : prev.length < 2 ? [...prev, s] : prev
                              )}
                              className={`pill-button ${sizesNote.includes(s) ? "active" : ""}`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    <div className="mt-5">
                      <p className="text-base font-medium text-foreground mb-1">
                        Anything making you unsure? <span className="font-normal text-muted-foreground">(optional)</span>
                      </p>
                      <textarea
                        value={contextNotes["Between sizes"] ?? ""}
                        onChange={(e) => setContextNotes((prev) => ({ ...prev, ["Between sizes"]: e.target.value }))}
                        placeholder="e.g. I'm usually a 7 but this brand runs small, and I have wide feet"
                        rows={2}
                        className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent resize-none"
                      />
                    </div>
                  </div>
                )}

                {uncertainties.filter(u => FOLLOWUP_UNCERTAINTIES.includes(u)).map((u) => (
                  <div key={u}>
                    <p className="text-base font-medium text-foreground mb-1">{u}</p>
                    <p className="text-base text-muted-foreground mb-2">What specifically are you unsure about?</p>
                    <textarea
                      value={contextNotes[u] ?? ""}
                      onChange={(e) => setContextNotes(prev => ({ ...prev, [u]: e.target.value }))}
                      placeholder="Be specific — this helps others give you real input..."
                      rows={2}
                      className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent resize-none"
                    />
                  </div>
                ))}

                {uncertainties.includes("Other") && (
                  <div>
                    <p className="text-base font-medium text-foreground mb-1">What else are you unsure about?</p>
                    <textarea
                      value={contextNotes["Other"] ?? ""}
                      onChange={(e) => setContextNotes(prev => ({ ...prev, Other: e.target.value }))}
                      placeholder="Describe what's holding you back..."
                      rows={3}
                      className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent resize-none"
                    />
                  </div>
                )}
              </div>

              <div className="mt-8">
                <button
                  onClick={() => setFlowStep("confidence")}
                  disabled={uncertainties.includes("Between sizes") && sizesNote.length < 2}
                  className="w-full text-base tracking-[0.18em] uppercase font-medium disabled:opacity-30 transition-all" style={{ background: "#1C1712", color: "#FDFAF6", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 2px 12px rgba(0,0,0,0.22)", padding: "16px 0" }}
                >
                  Continue
                </button>
                <button
                  onClick={() => setFlowStep("uncertainty")}
                  className="w-full mt-3 text-center text-base text-muted-foreground hover:text-foreground transition-colors"
                >
                  Back
                </button>
              </div>
            </motion.div>
          )}

          {/* ── STEP 5: CONFIDENCE ── */}
          {flowStep === "confidence" && product && (
            <motion.div key="confidence" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }}>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border mb-8">
                {displayImage ? (
                  <img src={displayImage} alt={product.name} className="w-12 h-14 rounded-lg object-cover bg-muted flex-shrink-0" />
                ) : (
                  <div className="w-12 h-14 rounded-lg bg-muted flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium text-foreground truncate">{product.name || "Unnamed item"}</p>
                  <p className="text-base text-muted-foreground">{product.brand || product.retailer}</p>
                </div>
              </div>

              <h2 className="font-sans text-3xl md:text-4xl font-light text-foreground mb-2">
                How confident are you right now?
              </h2>
              <p className="text-muted-foreground text-base mb-10">
                1 = not at all · 10 = very confident
              </p>

              <div className="flex justify-between gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <button
                    key={n}
                    onClick={() => setConfidence(n)}
                    className="flex-1 aspect-square max-w-[48px] text-base font-medium transition-all"
                    style={{
                      borderRadius: 6,
                      border: confidence === n ? "1px solid #1C1712" : "1px solid hsl(var(--border))",
                      background: confidence === n ? "#1C1712" : "transparent",
                      color: confidence === n ? "#FDFAF6" : "hsl(var(--muted-foreground))",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-base text-muted-foreground mt-2 mb-10">
                <span>Not confident</span>
                <span>Very confident</span>
              </div>

              <button
                onClick={submitDecision}
                disabled={submitting}
                className="w-full text-base tracking-[0.18em] uppercase font-medium disabled:opacity-30 transition-all" style={{ background: "#1C1712", color: "#FDFAF6", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 2px 12px rgba(0,0,0,0.22)", padding: "16px 0" }}
              >
                {submitting ? "Posting..." : "Post & get input"}
              </button>
              <button
                onClick={() => setFlowStep("uncertainty")}
                className="w-full mt-3 text-center text-base text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

    </div>
  );
};

export default PostDecision;
