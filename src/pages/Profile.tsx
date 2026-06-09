import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Pencil, Check, X, Camera, LogOut, TrendingUp, ChevronDown, ChevronUp, Plus, CircleCheck, ArrowRight, Bookmark } from "lucide-react";
import Cropper from "react-easy-crop";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { SILHOUETTE_OPTIONS, STYLE_OPTIONS } from "@/components/onboarding/OnboardingData";
import { computeMatchScore } from "@/lib/matching";
import { useIsMobile } from "@/hooks/use-mobile";
import heroEditorial from "@/assets/hero-editorial.png";

// ─── Badge levels ─────────────────────────────────────────────────────────────
function getBadge(v: number): { label: string; next: string; threshold: number } {
  if (v >= 50) return { label: "Top Voice",      next: "Top Voice",    threshold: 50 };
  if (v >= 25) return { label: "Trusted Voice",  next: "Top Voice",    threshold: 50 };
  if (v >= 5)  return { label: "Contributor",    next: "Trusted Voice",threshold: 25 };
  return        { label: "",                      next: "Contributor",  threshold: 5  };
}

// ─── Canvas crop ──────────────────────────────────────────────────────────────
async function getCroppedBlob(
  imageSrc: string,
  croppedAreaPixels: { x: number; y: number; width: number; height: number }
): Promise<Blob> {
  return new Promise((resolve) => {
    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 400; canvas.height = 400;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, croppedAreaPixels.x, croppedAreaPixels.y,
        croppedAreaPixels.width, croppedAreaPixels.height, 0, 0, 400, 400);
      canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.9);
    };
  });
}

// ─── Colors ───────────────────────────────────────────────────────────────────
const PAGE_BG  = "#4A312C";
const CARD_BG  = "#F5EFEA";
const PRIMARY  = "#1A1A1A";
const SECONDARY= "#5A4A42";
const MUTED    = "#8C7A70";
const ACCENT   = "#8E3A3A";
const DIVIDER  = "rgba(0,0,0,0.07)";
const PILL_BG  = "rgba(0,0,0,0.05)";
const PILL_BDR = "rgba(0,0,0,0.09)";
const TRUST_BG = "#3A1A17";

// ─── Component ────────────────────────────────────────────────────────────────
const Profile = () => {
  const navigate  = useNavigate();
  const isMobile  = useIsMobile();
  const { user, signOut } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data
  const [profile, setProfile]             = useState<any>(null);
  const [loading, setLoading]             = useState(true);
  const [stats, setStats]                 = useState({ decisions: 0, responses: 0, helpfulVotes: 0 });
  const [recentDecisions, setRecentDecisions] = useState<any[]>([]);

  // Edit modes
  const [editMode, setEditMode]           = useState<null | "silhouette" | "style">(null);
  const [editSilhouette, setEditSilhouette] = useState<string | null>(null);
  const [editStyle, setEditStyle]         = useState<string[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);

  // Inline name/info editing
  const [editing, setEditing]             = useState(false);
  const [editName, setEditName]           = useState("");
  const [editAge, setEditAge]             = useState("");
  const [editCity, setEditCity]           = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [saving, setSaving]               = useState(false);

  // Tags expand
  const [showAllTags, setShowAllTags]     = useState(false);

  // Fit photos
  const [fitPhotos, setFitPhotos]             = useState<string[]>([]);
  const [fitPhotoModal, setFitPhotoModal]     = useState<"upload" | "manage" | null>(null);
  const [pendingFiles, setPendingFiles]       = useState<File[]>([]);
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([]);
  const [uploadingFitPhotos, setUploadingFitPhotos] = useState(false);
  const [fitPhotoConfirm, setFitPhotoConfirm] = useState(false);
  const [draggingOver, setDraggingOver]       = useState(false);
  const fitPhotoInputRef                      = useRef<HTMLInputElement>(null);

  // Lightbox
  const [lightboxIdx, setLightboxIdx]     = useState<number | null>(null);

  // Tabs
  const [profileTab, setProfileTab]       = useState<"overview" | "saved">("overview");
  const [savedDecisions, setSavedDecisions] = useState<any[]>([]);

  // Crop
  const [cropSrc, setCropSrc]             = useState<string | null>(null);
  const [crop, setCrop]                   = useState({ x: 0, y: 0 });
  const [zoom, setZoom]                   = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // ─── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { navigate("/signin"); return; }
    fetchProfile();
    fetchStats();
    fetchSavedDecisions();
  }, [user]);

  useEffect(() => {
    if (editCity.length < 2) { setCitySuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const res  = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(editCity)}&limit=6&layer=city&layer=state`
        );
        const data = await res.json();
        const seen = new Set<string>();
        const results: string[] = [];
        for (const f of data.features ?? []) {
          const p = f.properties;
          const label = [p.name, p.state, p.country].filter(Boolean).join(", ");
          if (!seen.has(label)) { seen.add(label); results.push(label); }
          if (results.length >= 5) break;
        }
        setCitySuggestions(results);
      } catch { setCitySuggestions([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [editCity]);

  // ─── Data fetching ───────────────────────────────────────────────────────────
  const fetchProfile = async () => {
    const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
    if (data) {
      setProfile(data);
      setEditName(data.display_name ?? "");
      setEditAge(data.age?.toString() ?? "");
      setEditCity(data.city ?? "");
      // fit photos stored inside fit_details JSON to avoid needing a new column
      const storedPhotos = data.fit_details?._fit_photos ?? data.fit_photo_urls ?? [];
      setFitPhotos(Array.isArray(storedPhotos) ? storedPhotos : []);
    }
    setLoading(false);
  };

  const fetchStats = async () => {
    const [{ count: dCount }, { count: rCount }, { data: votes }, { data: recent }] = await Promise.all([
      supabase.from("decisions").select("*", { count: "exact", head: true }).eq("user_id", user!.id).is("deleted_at", null),
      supabase.from("responses").select("*", { count: "exact", head: true }).eq("user_id", user!.id),
      supabase.from("responses").select("helpfulness_votes").eq("user_id", user!.id),
      supabase.from("decisions")
        .select("id, product_name, brand_name, status, created_at, product_image_url, uncertainty_text, context_note")
        .eq("user_id", user!.id).is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(4),
    ]);
    const totalVotes = (votes ?? []).reduce((s: number, r: any) => s + (r.helpfulness_votes ?? 0), 0);
    setStats({ decisions: dCount ?? 0, responses: rCount ?? 0, helpfulVotes: totalVotes });
    if (recent) setRecentDecisions(recent);
  };

  const fetchSavedDecisions = async () => {
    const { data } = await supabase
      .from("saved_decisions")
      .select(`
        decision_id,
        decisions (
          id, product_name, brand_name, product_image_url,
          uncertainty_text, status, created_at, confidence_score
        )
      `)
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });
    if (data) setSavedDecisions(data.map((r: any) => r.decisions).filter(Boolean));
  };

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const saveBasicInfo = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    await supabase.from("profiles").update({
      display_name: editName.trim(),
      age: editAge ? parseInt(editAge) : null,
      city: editCity || null,
    }).eq("id", user!.id);
    setSaving(false); setEditing(false); fetchProfile();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file); e.target.value = "";
  };

  const onCropComplete = useCallback((_: any, px: any) => setCroppedAreaPixels(px), []);

  const applyCrop = async () => {
    if (!cropSrc || !croppedAreaPixels || !user) return;
    setUploadingPhoto(true);
    try {
      const blob = await getCroppedBlob(cropSrc, croppedAreaPixels);
      const path = `avatars/${user.id}.jpg`;
      const { error: upErr } = await supabase.storage.from("product-images").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (upErr) { alert("Upload failed: " + upErr.message); return; }
      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
      const url = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: upd } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user!.id);
      if (upd) { alert("Could not save: " + upd.message); return; }
      setProfile((p: any) => ({ ...p, avatar_url: url })); setCropSrc(null);
    } catch { alert("Something went wrong."); }
    finally { setUploadingPhoto(false); }
  };

  const openSilhouetteEdit = () => { setEditSilhouette(profile?.silhouette_preference?.[0] ?? null); setEditMode("silhouette"); };
  const saveSilhouette = async () => {
    if (!editSilhouette) return; setSavingProfile(true);
    await supabase.from("profiles").update({ silhouette_preference: [editSilhouette] }).eq("id", user!.id);
    setProfile((p: any) => ({ ...p, silhouette_preference: [editSilhouette] }));
    setSavingProfile(false); setEditMode(null);
  };

  // ─── Fit photo handlers ──────────────────────────────────────────────────────
  const addPendingFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).slice(0, 3 - fitPhotos.length);
    const newFiles = [...pendingFiles, ...arr].slice(0, 3 - fitPhotos.length);
    setPendingFiles(newFiles);
    newFiles.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => setPendingPreviews(prev => {
        const updated = [...prev];
        updated[newFiles.indexOf(f)] = reader.result as string;
        return updated;
      });
      reader.readAsDataURL(f);
    });
  };

  const saveFitPhotos = async () => {
    if (!pendingFiles.length || !user) return;
    setUploadingFitPhotos(true);
    const newUrls: string[] = [];
    for (const file of pendingFiles) {
      const path = `fit-photos/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { data: upData } = await supabase.storage.from("product-images").upload(path, file, { upsert: true, contentType: "image/jpeg" });
      if (upData) {
        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(upData.path);
        newUrls.push(urlData.publicUrl);
      }
    }
    const combined = [...fitPhotos, ...newUrls].slice(0, 3);
    const updatedFitDetails = { ...(profile?.fit_details ?? {}), _fit_photos: combined };
    await supabase.from("profiles").update({ fit_details: updatedFitDetails }).eq("id", user.id);
    setFitPhotos(combined);
    setPendingFiles([]); setPendingPreviews([]);
    setFitPhotoModal(null);
    setUploadingFitPhotos(false);
    setFitPhotoConfirm(true);
    setTimeout(() => setFitPhotoConfirm(false), 3000);
  };

  const removeFitPhoto = async (url: string) => {
    const updated = fitPhotos.filter(u => u !== url);
    const updatedFitDetails = { ...(profile?.fit_details ?? {}), _fit_photos: updated };
    await supabase.from("profiles").update({ fit_details: updatedFitDetails }).eq("id", user!.id);
    setFitPhotos(updated);
  };

  const openStyleEdit = () => { setEditStyle(profile?.style_aesthetics ?? []); setEditMode("style"); };
  const toggleStyle   = (l: string) => setEditStyle(p => p.includes(l) ? p.filter(s => s !== l) : p.length < 3 ? [...p, l] : p);
  const saveStyle     = async () => {
    if (!editStyle.length) return; setSavingProfile(true);
    await supabase.from("profiles").update({ style_aesthetics: editStyle }).eq("id", user!.id);
    setProfile((p: any) => ({ ...p, style_aesthetics: editStyle }));
    setSavingProfile(false); setEditMode(null);
  };

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const formatName  = (n: string | null) => n?.trim() || user?.email?.split("@")[0] || "You";
  const initial     = (profile?.display_name?.trim() || user?.email || "?")[0].toUpperCase();

  const rawSil  = profile?.silhouette_preference;
  const silLabel= Array.isArray(rawSil) ? rawSil[0] : (typeof rawSil === "string" ? rawSil : null);
  const sil     = SILHOUETTE_OPTIONS.find(s => s.label === silLabel);

  const badgeInfo = getBadge(stats.helpfulVotes);
  const badgePct  = Math.min(100, Math.round((stats.helpfulVotes / badgeInfo.threshold) * 100));

  const avgHelp   = stats.responses > 0
    ? Math.min(5, stats.helpfulVotes / stats.responses).toFixed(1)
    : null;

  // Value-based trust line from profile data
  const trustLine = (() => {
    const lines: string[] = [];
    if (sil) {
      const sl = sil.label.toLowerCase();
      if (sl.includes("curv"))     lines.push("Gives reliable fit advice for curvier silhouettes.");
      else if (sl.includes("lean") || sl.includes("slim")) lines.push("Helps with sizing decisions for slimmer builds.");
      else if (sl.includes("athletic") || sl.includes("sculpt")) lines.push("Advises on fit for athletic and structured frames.");
      else if (sl.includes("petite")) lines.push("Sizing expertise for petite and shorter frames.");
      else if (sl.includes("soft") || sl.includes("mid"))  lines.push("Thoughtful sizing advice for softer, fuller silhouettes.");
      else lines.push("Gives honest, grounded fit and sizing advice.");
    } else if (stats.responses > 3) {
      lines.push("Regularly helps others make more confident purchase decisions.");
    }
    const styles = profile?.style_aesthetics ?? [];
    if (styles.length && profile?.fit_preference) {
      lines.push(`Focuses on ${profile.fit_preference.toLowerCase()} fits with a ${styles.slice(0, 2).join(", ").toLowerCase()} point of view.`);
    } else if (styles.length) {
      lines.push(`Brings a ${styles.slice(0, 2).join(", ").toLowerCase()} perspective to every decision.`);
    } else if (profile?.fit_preference) {
      lines.push(`Specializes in ${profile.fit_preference.toLowerCase()} fits and proportions.`);
    }
    return lines.join(" ") || "Helps others decide on sizing, fit, and proportion.";
  })();

  // Fit tags — nuances only, no height/size repeats, no average values
  const AVERAGE_TERMS = ["average", "about average", "typical", "standard", "normal", "medium", "moderate"];
  const isAverage = (v: string) => AVERAGE_TERMS.some(t => v.toLowerCase().includes(t));

  const fitDetails = profile?.fit_details as Record<string, string> | null;
  const notableFit = fitDetails
    ? Object.entries(fitDetails)
        .filter(([k, v]) => v && k !== "Overall fit" && !isAverage(v))
        .map(([, v]) => v)
    : [];

  const allTags = [
    // fit preference only if it's not average
    profile?.fit_preference && !isAverage(profile.fit_preference) ? profile.fit_preference : null,
    ...notableFit,
  ].filter(Boolean) as string[];
  const visibleTags = showAllTags ? allTags : allTags.slice(0, 5);

  // Collage images from recent decisions
  const collageImgs = recentDecisions.filter(d => d.product_image_url).map(d => d.product_image_url).slice(0, 3);

  // ─── Mirrors ──────────────────────────────────────────────────────────────────
  const [mirrors, setMirrors] = useState<{ id: string; display_name: string | null; avatar_url: string | null; city: string | null; age?: number | null; height_range?: string | null; silhouette_preference: string[] | null; style_aesthetics?: string[] | null; score: number }[]>([]);

  useEffect(() => {
    if (!profile || !user) return;
    const fetchMirrors = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, city, silhouette_preference, height_range, top_size, bottom_size, fit_preference, fit_details, style_aesthetics, purchase_frequency, risk_tolerance")
        .neq("id", user.id)
        .limit(120);
      if (!data) return;
      const scored = data
        .filter((p: any) => p != null)
        .map((p: any) => ({ ...p, score: Math.round(computeMatchScore(profile, p).total) }))
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 3);
      setMirrors(scored);
    };
    fetchMirrors();
  }, [profile, user]);

  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "Today"; if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // Shared button styles
  const btnPrimary: React.CSSProperties = { padding: "10px 22px", borderRadius: 100, background: ACCENT, color: "white", border: "none", fontSize: 15, letterSpacing: "0.16em", textTransform: "uppercase" as const, fontWeight: 700, cursor: "pointer" };
  const btnSecondary: React.CSSProperties = { padding: "10px 22px", borderRadius: 100, background: "transparent", border: `1px solid ${PILL_BDR}`, color: MUTED, fontSize: 15, letterSpacing: "0.16em", textTransform: "uppercase" as const, cursor: "pointer" };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#ECE7DF", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "rgba(28,23,18,0.4)", fontSize: 15 }}>Loading...</p>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", position: "relative", background: "#ECE7DF" }}>

      {/* ── Hero background (fixed, matches Feed) ─────────────────────────── */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", zIndex: 0 }}>
        <img
          src={heroEditorial}
          aria-hidden
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "60% center", filter: "brightness(1.08) saturate(0.85)", pointerEvents: "none", userSelect: "none" }}
        />
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(to right, rgba(240,236,230,0.18) 0%, rgba(240,236,230,0.62) 22%, rgba(240,236,230,0.72) 38%, rgba(240,236,230,0.72) 62%, rgba(240,236,230,0.62) 78%, rgba(240,236,230,0.18) 100%)" }} />
      </div>

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <div style={{ position: "relative", zIndex: 1 }}>

      {/* ── Crop modal ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {cropSrc && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.93)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px" }}>
              <button onClick={() => setCropSrc(null)} style={{ color: "rgba(255,255,255,0.55)", background: "none", border: "none", cursor: "pointer", fontSize: 15 }}>Cancel</button>
              <p style={{ color: "white", fontSize: 16, fontWeight: 500 }}>Position your photo</p>
              <button onClick={applyCrop} disabled={uploadingPhoto}
                style={{ color: uploadingPhoto ? "rgba(255,255,255,0.3)" : "#F5EFEA", background: "none", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>
                {uploadingPhoto ? "Saving..." : "Apply"}
              </button>
            </div>
            <div style={{ flex: 1, position: "relative" }}>
              <Cropper image={cropSrc} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false}
                onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete} />
            </div>
            <div style={{ padding: "20px 32px 32px" }}>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 15, textAlign: "center", marginBottom: 10 }}>Pinch or scroll to zoom</p>
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} style={{ width: "100%", accentColor: "white" }} />
            </div>
          </motion.div>
        )}

        {/* ── Upload modal ────────────────────────────────────────────────────── */}
        {fitPhotoModal === "upload" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={e => { if (e.target === e.currentTarget) { setFitPhotoModal(null); setPendingFiles([]); setPendingPreviews([]); } }}>
            <motion.div initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} transition={{ type: "spring", damping: 28, stiffness: 280 }}
              style={{ background: CARD_BG, borderRadius: "20px 20px 0 0", padding: "28px 28px 40px", width: "100%", maxWidth: 520 }}>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <p style={{ fontSize: 17, fontWeight: 700, color: PRIMARY }}>Add photos</p>
                <button onClick={() => { setFitPhotoModal(null); setPendingFiles([]); setPendingPreviews([]); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}>
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>
              <p style={{ fontSize: 15, color: SECONDARY, marginBottom: 4 }}>
                Upload up to {3 - fitPhotos.length} photo{3 - fitPhotos.length !== 1 ? "s" : ""} that show how clothes fit on your body.
              </p>
              <p style={{ fontSize: 16, color: MUTED, marginBottom: 20 }}>These help others make better decisions.</p>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDraggingOver(true); }}
                onDragLeave={() => setDraggingOver(false)}
                onDrop={e => { e.preventDefault(); setDraggingOver(false); addPendingFiles(e.dataTransfer.files); }}
                onClick={() => fitPhotoInputRef.current?.click()}
                style={{ border: `2px dashed ${draggingOver ? ACCENT : PILL_BDR}`, borderRadius: 16, padding: "28px 20px", textAlign: "center", cursor: "pointer", background: draggingOver ? "rgba(142,58,58,0.04)" : "transparent", transition: "all 0.15s", marginBottom: 16 }}>
                <input ref={fitPhotoInputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
                  onChange={e => e.target.files && addPendingFiles(e.target.files)} />
                <p style={{ fontSize: 15, color: MUTED, marginBottom: 4 }}>Drag & drop or click to upload</p>
                <p style={{ fontSize: 15, color: MUTED, opacity: 0.7 }}>Max {3 - fitPhotos.length} image{3 - fitPhotos.length !== 1 ? "s" : ""}</p>
              </div>

              {/* Previews */}
              {pendingPreviews.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  {pendingPreviews.map((src, i) => src && (
                    <div key={i} style={{ position: "relative" }}>
                      <img src={src} alt="" style={{ width: 76, height: 100, objectFit: "cover", borderRadius: 10 }} />
                      <button onClick={() => { setPendingFiles(f => f.filter((_, fi) => fi !== i)); setPendingPreviews(p => p.filter((_, pi) => pi !== i)); }}
                        style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: PRIMARY, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <X style={{ width: 10, height: 10, color: "white" }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={saveFitPhotos} disabled={pendingFiles.length === 0 || uploadingFitPhotos}
                style={{ ...btnPrimary, width: "100%", textAlign: "center", marginBottom: 10, opacity: pendingFiles.length === 0 ? 0.4 : 1 }}>
                {uploadingFitPhotos ? "Saving..." : "Save photos"}
              </button>
              <button onClick={() => { setFitPhotoModal(null); setPendingFiles([]); setPendingPreviews([]); }}
                style={{ ...btnSecondary, width: "100%", textAlign: "center" }}>
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* ── Lightbox ────────────────────────────────────────────────────────── */}
        {lightboxIdx !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setLightboxIdx(null)}
            style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}>

            {/* Close */}
            <button onClick={() => setLightboxIdx(null)}
              style={{ position: "absolute", top: 20, right: 20, width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X style={{ width: 16, height: 16, color: "white" }} />
            </button>

            {/* Prev */}
            {lightboxIdx > 0 && (
              <button onClick={e => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
                style={{ position: "absolute", left: 20, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ArrowLeft style={{ width: 18, height: 18, color: "white" }} />
              </button>
            )}

            {/* Image */}
            <motion.img
              key={lightboxIdx}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              src={fitPhotos[lightboxIdx]}
              alt=""
              onClick={e => e.stopPropagation()}
              style={{ maxHeight: "88vh", maxWidth: "88vw", objectFit: "contain", borderRadius: 16, boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}
            />

            {/* Next */}
            {lightboxIdx < fitPhotos.length - 1 && (
              <button onClick={e => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
                style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ArrowLeft style={{ width: 18, height: 18, color: "white", transform: "rotate(180deg)" }} />
              </button>
            )}

            {/* Dot indicators */}
            {fitPhotos.length > 1 && (
              <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6 }}>
                {fitPhotos.map((_, i) => (
                  <div key={i} onClick={e => { e.stopPropagation(); setLightboxIdx(i); }}
                    style={{ width: i === lightboxIdx ? 20 : 6, height: 6, borderRadius: 100, background: i === lightboxIdx ? "white" : "rgba(255,255,255,0.35)", cursor: "pointer", transition: "all 0.2s" }} />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Manage modal ────────────────────────────────────────────────────── */}
        {fitPhotoModal === "manage" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={e => { if (e.target === e.currentTarget) setFitPhotoModal(null); }}>
            <motion.div initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} transition={{ type: "spring", damping: 28, stiffness: 280 }}
              style={{ background: CARD_BG, borderRadius: "20px 20px 0 0", padding: "28px 28px 40px", width: "100%", maxWidth: 520 }}>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <p style={{ fontSize: 17, fontWeight: 700, color: PRIMARY }}>Your photos</p>
                <button onClick={() => setFitPhotoModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}>
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>

              <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
                {fitPhotos.map((url, i) => (
                  <div key={i} style={{ flex: 1, position: "relative" }}>
                    <img src={url} alt="" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: 12, display: "block" }} />
                    <button onClick={() => removeFitPhoto(url)}
                      style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <X style={{ width: 11, height: 11, color: "white" }} />
                    </button>
                  </div>
                ))}
                {fitPhotos.length < 3 && (
                  <button onClick={() => { setPendingFiles([]); setPendingPreviews([]); setFitPhotoModal("upload"); }}
                    style={{ flex: 1, aspectRatio: "3/4", borderRadius: 12, border: `1.5px dashed ${PILL_BDR}`, background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}>
                    <Plus style={{ width: 18, height: 18, color: MUTED }} />
                    <span style={{ fontSize: 15, color: MUTED }}>Add photo</span>
                  </button>
                )}
              </div>

              <button onClick={() => setFitPhotoModal(null)} style={{ ...btnPrimary, width: "100%", textAlign: "center" }}>
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Nav header ─────────────────────────────────────────────────────── */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 32px" }}>
        <button onClick={() => navigate("/feed")}
          style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(28,23,18,0.55)", background: "none", border: "none", cursor: "pointer" }}>
          <ArrowLeft style={{ width: 14, height: 14 }} />
          <span style={{ fontSize: 15 }}>Feed</span>
        </button>
        <span style={{ fontSize: 15, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(28,23,18,0.38)" }}>Profile</span>
        <button onClick={async () => { await signOut(); navigate("/"); }}
          style={{ display: "flex", alignItems: "center", gap: 5, color: "rgba(28,23,18,0.55)", background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>
          <LogOut style={{ width: 13, height: 13 }} />
          Sign out
        </button>
      </header>

      {/* ── Tab switcher ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 2, background: "rgba(28,23,18,0.07)", borderRadius: 100, padding: "4px" }}>
          <button
            onClick={() => setProfileTab("overview")}
            style={{
              padding: "8px 24px", borderRadius: 100, fontSize: 15, fontWeight: 500,
              border: "none", cursor: "pointer", transition: "all 0.18s",
              background: profileTab === "overview" ? "rgba(28,23,18,0.10)" : "transparent",
              color: profileTab === "overview" ? "#1C1712" : "rgba(28,23,18,0.45)",
            }}
          >
            Overview
          </button>
          <button
            onClick={() => setProfileTab("saved")}
            style={{
              padding: "8px 24px", borderRadius: 100, fontSize: 15, fontWeight: 500,
              border: "none", cursor: "pointer", transition: "all 0.18s",
              background: profileTab === "saved" ? "rgba(28,23,18,0.10)" : "transparent",
              color: profileTab === "saved" ? "#1C1712" : "rgba(28,23,18,0.45)",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <Bookmark style={{ width: 13, height: 13 }} />
            Saved {savedDecisions.length > 0 && `(${savedDecisions.length})`}
          </button>
        </div>
      </div>

      {/* ── Page content ───────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 28px 80px" }}>

      {/* ── Saved tab ─────────────────────────────────────────────────────── */}
      {profileTab === "saved" && (
        <div>
          {savedDecisions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 24px" }}>
              <Bookmark style={{ width: 36, height: 36, color: MUTED, margin: "0 auto 16px", display: "block" }} />
              <p style={{ fontSize: 18, fontWeight: 600, color: PRIMARY, marginBottom: 8 }}>Nothing saved yet</p>
              <p style={{ fontSize: 16, color: MUTED }}>Bookmark posts in the feed to revisit them later.</p>
              <button
                onClick={() => navigate("/feed")}
                style={{ marginTop: 24, padding: "12px 28px", borderRadius: 100, background: "#1C1712", color: "#FDFAF6", border: "none", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
              >
                Go to feed
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {savedDecisions.map((d: any) => (
                <div
                  key={d.id}
                  onClick={() => navigate("/feed")}
                  style={{ background: CARD_BG, borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.07)", cursor: "pointer", transition: "transform 0.15s", position: "relative" }}
                >
                  {d.product_image_url ? (
                    <img src={d.product_image_url} alt={d.product_name} style={{ width: "100%", height: 220, objectFit: "cover", objectPosition: "top", display: "block" }} />
                  ) : (
                    <div style={{ width: "100%", height: 120, background: "linear-gradient(135deg, rgba(196,158,100,0.12), rgba(196,158,100,0.04))", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Bookmark style={{ width: 28, height: 28, color: "rgba(196,158,100,0.4)" }} />
                    </div>
                  )}
                  <div style={{ padding: "14px 16px 16px" }}>
                    {d.brand_name && (
                      <p style={{ fontSize: 16, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTED, marginBottom: 3 }}>{d.brand_name}</p>
                    )}
                    <p style={{ fontSize: 15, fontWeight: 700, color: PRIMARY, lineHeight: 1.3, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.product_name ?? "Untitled"}
                    </p>
                    {d.uncertainty_text && (
                      <p style={{ fontSize: 16, color: SECONDARY, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>
                        "{d.uncertainty_text}"
                      </p>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: d.status === "open" ? "#16a34a" : MUTED }} />
                      <span style={{ fontSize: 15, color: SECONDARY, fontWeight: 500 }}>{d.status === "open" ? "Open" : "Closed"}</span>
                      <span style={{ fontSize: 15, color: MUTED, marginLeft: "auto" }}>Confidence {d.confidence_score}/10</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Overview tab ──────────────────────────────────────────────────── */}
      {profileTab === "overview" && (
      <div>

        {/* ══════════════════════════════════════════════════════════════════
            CARD 1 — Profile header
        ══════════════════════════════════════════════════════════════════ */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: CARD_BG, borderRadius: 20, overflow: "hidden", marginBottom: 12, position: "relative" }}>

          {/* Collage background — right side */}
          {collageImgs.length > 0 && (
            <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "48%", overflow: "hidden", pointerEvents: "none" }}>
              <div style={{ position: "relative", width: "100%", height: "100%", filter: "blur(2px)", opacity: 0.65 }}>
                {collageImgs[0] && (
                  <img src={collageImgs[0]} alt="" style={{ position: "absolute", top: "8%", right: "8%", width: "52%", height: "65%", objectFit: "cover", borderRadius: 14, transform: "rotate(2deg)", boxShadow: "0 6px 24px rgba(0,0,0,0.18)" }} />
                )}
                {collageImgs[1] && (
                  <img src={collageImgs[1]} alt="" style={{ position: "absolute", top: "5%", right: "48%", width: "38%", height: "45%", objectFit: "cover", borderRadius: 14, transform: "rotate(-3.5deg)", boxShadow: "0 6px 24px rgba(0,0,0,0.18)" }} />
                )}
                {collageImgs[2] && (
                  <img src={collageImgs[2]} alt="" style={{ position: "absolute", bottom: "6%", right: "4%", width: "44%", height: "38%", objectFit: "cover", borderRadius: 14, transform: "rotate(-1.5deg)", boxShadow: "0 6px 24px rgba(0,0,0,0.18)" }} />
                )}
              </div>
              {/* Fade-left gradient so left text stays clean */}
              <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to right, ${CARD_BG} 0%, rgba(245,239,234,0.88) 28%, rgba(245,239,234,0.35) 65%, transparent 100%)` }} />
            </div>
          )}

          {/* Left content — avatar + identity side by side */}
          <div style={{ position: "relative", zIndex: 1, padding: "32px 36px 24px", maxWidth: collageImgs.length ? "60%" : "100%", display: "flex", gap: 24, alignItems: "flex-start" }}>

            {/* Avatar */}
            <div style={{ position: "relative", display: "inline-block", flexShrink: 0 }}>
              <div style={{ width: 130, height: 130, borderRadius: "50%", background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42, fontWeight: 700, color: "white", overflow: "hidden" }}>
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : initial}
              </div>
              <button onClick={() => fileInputRef.current?.click()}
                style={{ position: "absolute", bottom: 4, right: 4, width: 30, height: 30, borderRadius: "50%", background: CARD_BG, border: `1px solid ${PILL_BDR}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
                <Camera style={{ width: 13, height: 13, color: MUTED }} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileSelect} />
            </div>

            {/* Identity — name / badge / age+city */}
            <div style={{ paddingTop: 8, minWidth: 0 }}>

              {/* Badge */}
              {badgeInfo.label && (
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: ACCENT, borderBottom: `1px solid ${ACCENT}`, paddingBottom: 1 }}>
                    {badgeInfo.label}
                  </span>
                </div>
              )}

              {/* Name + edit */}
              {editing ? (
                <div style={{ maxWidth: 380 }}>
                  <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} placeholder="Full name"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: `1px solid ${PILL_BDR}`, background: "white", fontSize: 15, color: PRIMARY, outline: "none", marginBottom: 8, boxSizing: "border-box" }} />
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <input value={editAge} onChange={e => setEditAge(e.target.value.replace(/\D/g, ""))} placeholder="Age" maxLength={3}
                      style={{ width: "28%", padding: "10px 12px", borderRadius: 12, border: `1px solid ${PILL_BDR}`, background: "white", fontSize: 16, color: PRIMARY, outline: "none", boxSizing: "border-box" }} />
                    <div style={{ flex: 1, position: "relative" }}>
                      <input value={editCity} onChange={e => setEditCity(e.target.value)} placeholder="City"
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: `1px solid ${PILL_BDR}`, background: "white", fontSize: 16, color: PRIMARY, outline: "none", boxSizing: "border-box" }} />
                      {citySuggestions.length > 0 && (
                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "white", border: `1px solid ${PILL_BDR}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", zIndex: 10 }}>
                          {citySuggestions.map(c => (
                            <button key={c} onClick={() => { setEditCity(c.split(",")[0]); setCitySuggestions([]); }}
                              style={{ width: "100%", textAlign: "left", padding: "10px 14px", fontSize: 15, color: PRIMARY, background: "none", border: "none", cursor: "pointer", borderBottom: `1px solid ${DIVIDER}` }}>
                              {c}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={saveBasicInfo} disabled={saving} style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 6, opacity: saving ? 0.5 : 1 }}>
                      <Check style={{ width: 11, height: 11 }} />{saving ? "Saving..." : "Save"}
                    </button>
                    <button onClick={() => { setEditing(false); setEditName(profile?.display_name ?? ""); setEditAge(profile?.age?.toString() ?? ""); setEditCity(profile?.city ?? ""); }}
                      style={{ ...btnSecondary, display: "flex", alignItems: "center", gap: 6 }}>
                      <X style={{ width: 11, height: 11 }} /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <h1 style={{ fontSize: 34, fontWeight: 700, color: PRIMARY, lineHeight: 1.05, margin: 0, flexShrink: 1, minWidth: 0 }}>
                      {formatName(profile?.display_name)}
                    </h1>
                    <button onClick={() => setEditing(true)} style={{ color: MUTED, background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: 0, lineHeight: 0 }}>
                      <Pencil style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                  {(profile?.age || profile?.city) && (
                    <p style={{ fontSize: 15, color: MUTED, margin: 0, marginTop: 10 }}>
                      {[profile?.age, profile?.city?.split(",")[0]].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Fit photos section ─────────────────────────────────────────────── */}
          <div style={{ position: "relative", zIndex: 1, padding: "0 36px 28px", borderTop: `1px solid ${DIVIDER}` }}>

            {fitPhotos.length === 0 ? (
              /* STATE 1: Empty */
              <div style={{ paddingTop: 20 }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: PRIMARY, marginBottom: 6 }}>
                  Help someone like you decide
                </p>
                <p style={{ fontSize: 15, color: SECONDARY, lineHeight: 1.6, marginBottom: 4 }}>
                  Add 1–3 photos so women with a similar body can see how things actually fit.
                </p>
                <p style={{ fontSize: 16, color: MUTED, marginBottom: 16 }}>
                  This makes your advice more useful.
                </p>

                <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                  {/* Add photo tile */}
                  <button
                    onClick={() => { setPendingFiles([]); setPendingPreviews([]); setFitPhotoModal("upload"); }}
                    style={{ width: 150, height: 200, borderRadius: 16, border: `1.5px dashed ${PILL_BDR}`, background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", flexShrink: 0 }}>
                    <Plus style={{ width: 22, height: 22, color: MUTED }} />
                    <span style={{ fontSize: 16, color: MUTED, letterSpacing: "0.03em", textAlign: "center", lineHeight: 1.4 }}>Add{"\n"}photo</span>
                  </button>

                  {/* Tips with check icons */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 6 }}>
                    {["full body", "natural lighting", "everyday outfits"].map(tip => (
                      <div key={tip} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <CircleCheck style={{ width: 14, height: 14, color: MUTED, flexShrink: 0 }} />
                        <span style={{ fontSize: 16, color: MUTED }}>{tip}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <AnimatePresence>
                  {fitPhotoConfirm && (
                    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      style={{ fontSize: 16, color: "#16a34a", marginTop: 12 }}>
                      Your profile is now more helpful to others
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              /* STATE 2: Filled */
              <div style={{ paddingTop: 20 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {fitPhotos.map((url, i) => (
                    <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                      <button onClick={() => setLightboxIdx(i)}
                        style={{ width: 150, height: 200, borderRadius: 16, overflow: "hidden", border: "none", cursor: "zoom-in", padding: 0, display: "block" }}>
                        <img src={url} alt={`Fit photo ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
                      </button>
                      {/* Edit overlay — owner only */}
                      <button onClick={() => setFitPhotoModal("manage")}
                        style={{ position: "absolute", top: 7, right: 7, width: 24, height: 24, borderRadius: "50%", background: "rgba(0,0,0,0.45)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Pencil style={{ width: 10, height: 10, color: "white" }} />
                      </button>
                    </div>
                  ))}
                  {fitPhotos.length < 3 && (
                    <button onClick={() => { setPendingFiles([]); setPendingPreviews([]); setFitPhotoModal("upload"); }}
                      style={{ width: 150, height: 200, borderRadius: 16, border: `1.5px dashed ${PILL_BDR}`, background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", flexShrink: 0 }}>
                      <Plus style={{ width: 22, height: 22, color: MUTED }} />
                      <span style={{ fontSize: 16, color: MUTED, textAlign: "center", lineHeight: 1.4 }}>Add{"\n"}photo</span>
                    </button>
                  )}
                </div>
                <p style={{ fontSize: 16, fontWeight: 600, color: SECONDARY }}>you, IRL</p>
                <AnimatePresence>
                  {fitPhotoConfirm && (
                    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      style={{ fontSize: 16, color: "#16a34a", marginTop: 8 }}>
                      Your profile is now more helpful to others
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Trust bar — full-width strip at bottom of header card */}
          {!editing && (
            <div style={{ background: TRUST_BG, padding: isMobile ? "14px 18px" : "14px 28px", display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, position: "relative", zIndex: 2 }}>
              <span style={{ fontSize: 16, color: "#C4A47A", flexShrink: 0 }}>✦</span>
              <div style={{ flexShrink: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(245,239,234,0.92)", marginBottom: 2 }}>
                  Building trust in the community
                </p>
                <p style={{ fontSize: 15, color: "rgba(245,239,234,0.50)", lineHeight: 1.4 }}>
                  {stats.helpfulVotes} of {badgeInfo.threshold} helpful responses to reach {badgeInfo.next}
                </p>
              </div>
              {/* Segmented progress bar — 5 segments (hidden on mobile; text + count convey progress) */}
              {!isMobile && (() => {
                const SEGMENTS = 5;
                const filledCount = Math.round((stats.helpfulVotes / badgeInfo.threshold) * SEGMENTS);
                return (
                  <div style={{ flex: 1, display: "flex", gap: 4, alignItems: "center", margin: "0 8px" }}>
                    {Array.from({ length: SEGMENTS }).map((_, i) => (
                      <div key={i} style={{
                        flex: 1,
                        height: 5,
                        borderRadius: 100,
                        background: i < filledCount ? ACCENT : "rgba(255,255,255,0.14)",
                        transition: "background 0.4s ease",
                      }} />
                    ))}
                  </div>
                );
              })()}
              <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(245,239,234,0.75)", flexShrink: 0, marginLeft: isMobile ? "auto" : 0 }}>
                {stats.helpfulVotes} / {badgeInfo.threshold}
              </span>
            </div>
          )}
        </motion.div>

        {/* ══════════════════════════════════════════════════════════════════
            CARD 2 — Stats + Helpfulness
        ══════════════════════════════════════════════════════════════════ */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
          style={{ background: CARD_BG, borderRadius: 20, marginBottom: 12, overflow: "hidden" }}>

          {/* 3-col stats row */}
          <div style={{ display: "flex", borderBottom: `1px solid ${DIVIDER}` }}>
            {[
              { value: stats.decisions, label: "Decisions\nposted" },
              { value: stats.responses, label: "Takes\ngiven" },
              { value: stats.helpfulVotes, label: "Marked\nhelpful" },
            ].map(({ value, label }, i) => (
              <div key={label} style={{ flex: 1, textAlign: "center", padding: "28px 16px", borderRight: i < 2 ? `1px solid ${DIVIDER}` : "none" }}>
                <p style={{ fontSize: 36, fontWeight: 700, color: PRIMARY, lineHeight: 1, marginBottom: 8 }}>{value}</p>
                <p style={{ fontSize: 15, color: MUTED, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1.5, whiteSpace: "pre-line" }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Average helpfulness */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px 24px" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <TrendingUp style={{ width: 20, height: 20, color: "white" }} />
            </div>
            <div style={{ flex: 1 }}>
              {avgHelp ? (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 3 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: PRIMARY }}>{avgHelp}</span>
                    <span style={{ fontSize: 16, color: MUTED }}>/  5 average helpfulness</span>
                  </div>
                  <p style={{ fontSize: 16, color: MUTED }}>
                    Based on {stats.responses} response{stats.responses !== 1 ? "s" : ""} · Rated by other users
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 15, fontWeight: 600, color: SECONDARY, marginBottom: 3 }}>No helpfulness data yet</p>
                  <p style={{ fontSize: 16, color: MUTED }}>Start weighing in to build your score</p>
                </>
              )}
            </div>
          </div>
        </motion.div>

        {/* ══════════════════════════════════════════════════════════════════
            CARD 2.5 — Your mirrors
        ══════════════════════════════════════════════════════════════════ */}
        {mirrors.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}
            style={{ background: CARD_BG, borderRadius: 20, marginBottom: 12, padding: "28px 28px 24px" }}>

            <p style={{ fontSize: 16, letterSpacing: "0.3em", textTransform: "uppercase", color: MUTED, marginBottom: 4 }}>
              Your Mirrors
            </p>
            <p style={{ fontSize: 15, color: MUTED, marginBottom: 20 }}>matched on fit, taste, and how you shop</p>

            {/* Horizontal scroll row */}
            <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 10, scrollbarWidth: "none", margin: "0 -28px", padding: "0 28px 10px" }}>
              {mirrors.map((m) => {
                const silLabel = Array.isArray(m.silhouette_preference) ? m.silhouette_preference[0] : null;
                const mirrorInitial = (m.display_name?.trim() || "?")[0].toUpperCase();
                // Tags: silhouette, height, first style aesthetic
                const tags = [
                  silLabel,
                  m.height_range ?? null,
                  (m.style_aesthetics ?? [])[0] ?? null,
                ].filter(Boolean) as string[];

                return (
                  <button
                    key={m.id}
                    onClick={() => navigate(`/profile/${m.id}`)}
                    style={{
                      flexShrink: 0,
                      width: 280,
                      background: CARD_BG,
                      borderRadius: 24,
                      border: "1px solid rgba(0,0,0,0.07)",
                      padding: "24px 22px 20px",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      flexDirection: "column",
                      boxShadow: "0 6px 24px rgba(0,0,0,0.08)",
                      position: "relative",
                    }}
                  >
                    {/* Gold match % badge — top-left of card */}
                    <div style={{
                      position: "absolute",
                      top: 16,
                      left: 16,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "linear-gradient(135deg, #C4A47A 0%, #B8956A 50%, #A07848 100%)",
                      border: "1px solid rgba(220,185,130,0.60)",
                      borderRadius: 100,
                      padding: "5px 12px",
                      boxShadow: "0 0 10px rgba(184,149,106,0.50), 0 0 22px rgba(184,149,106,0.20), inset 0 1px 0 rgba(255,255,255,0.22)",
                      zIndex: 2,
                    }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#FDFAF6", letterSpacing: "0.03em" }}>✦ {m.score}% match</span>
                    </div>

                    {/* Avatar — large, centred */}
                    <div style={{
                      width: 164,
                      height: 164,
                      borderRadius: "50%",
                      margin: "0 auto 20px",
                      overflow: "hidden",
                      background: "#3A3530",
                      flexShrink: 0,
                      boxShadow: "0 8px 28px rgba(0,0,0,0.14)",
                    }}>
                      {m.avatar_url
                        ? <img src={m.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 52, fontWeight: 700, color: "white" }}>{mirrorInitial}</div>
                      }
                    </div>

                    {/* Name */}
                    <p style={{ fontSize: 22, fontWeight: 700, color: PRIMARY, lineHeight: 1.15, marginBottom: 4, textAlign: "center" }}>
                      {m.display_name?.trim() || "Anonymous"}
                    </p>

                    {/* Age + city */}
                    {(m.age || m.city) ? (
                      <p style={{ fontSize: 15, color: MUTED, marginBottom: 16, textAlign: "center" }}>
                        {[m.age, m.city?.split(",")[0]].filter(Boolean).join(" · ")}
                      </p>
                    ) : <div style={{ marginBottom: 16 }} />}

                    {/* Fit tags */}
                    {tags.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18, justifyContent: "center" }}>
                        {tags.map((tag, i) => (
                          <span key={i} style={{
                            fontSize: 15,
                            color: SECONDARY,
                            background: PILL_BG,
                            border: `1px solid ${PILL_BDR}`,
                            borderRadius: 100,
                            padding: "4px 11px",
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Arrow — bottom right */}
                    <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 15, color: MUTED, letterSpacing: "0.04em" }}>See profile</span>
                      <ArrowRight style={{ width: 14, height: 14, color: MUTED }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            CARD 3 — Fit profile
        ══════════════════════════════════════════════════════════════════ */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.10 }}
          style={{ background: CARD_BG, borderRadius: 20, marginBottom: 12, padding: "28px 28px 24px" }}>

          <p style={{ fontSize: 16, letterSpacing: "0.3em", textTransform: "uppercase", color: MUTED, marginBottom: 24 }}>
            Your fit profile
          </p>

          {editMode === "silhouette" ? (
            <div>
              <p style={{ fontSize: 15, color: MUTED, marginBottom: 16 }}>Select your silhouette</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                {SILHOUETTE_OPTIONS.map(opt => (
                  <button key={opt.label} onClick={() => setEditSilhouette(opt.label)}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, borderRadius: 14, border: `1px solid ${editSilhouette === opt.label ? ACCENT : PILL_BDR}`, background: editSilhouette === opt.label ? "rgba(142,58,58,0.06)" : "white", padding: "12px 8px", cursor: "pointer", transition: "all 0.15s" }}>
                    <img src={opt.image} alt={opt.label} style={{ width: 52, height: 70, objectFit: "cover", objectPosition: "top", borderRadius: 8 }} />
                    <p style={{ fontSize: 15, fontWeight: 600, color: PRIMARY, textAlign: "center", lineHeight: 1.3 }}>{opt.label}</p>
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={saveSilhouette} disabled={!editSilhouette || savingProfile} style={{ ...btnPrimary, flex: 1, opacity: (!editSilhouette || savingProfile) ? 0.4 : 1 }}>{savingProfile ? "Saving..." : "Save"}</button>
                <button onClick={() => setEditMode(null)} style={btnSecondary}>Cancel</button>
              </div>
            </div>
          ) : sil ? (
            <div>
              {/* Silhouette hero + sizing columns */}
              <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 20 }}>
                <img src={sil.image} alt={sil.label}
                  style={{ width: 88, height: 116, objectFit: "cover", objectPosition: "top", borderRadius: 14, flexShrink: 0 }} />
                <div style={{ flex: 1, paddingTop: 4 }}>
                  <p style={{ fontSize: 26, fontWeight: 700, color: PRIMARY, lineHeight: 1.1, marginBottom: 6 }}>{sil.label}</p>
                  <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, marginBottom: 14 }}>{sil.desc}</p>
                  <button onClick={openSilhouetteEdit}
                    style={{ fontSize: 16, color: ACCENT, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    Update profile →
                  </button>
                </div>
              </div>

              {/* Height / Top size / Bottom size — 3 cols with labels */}
              {(profile?.height_range || profile?.top_size || profile?.bottom_size) && (
                <div style={{ display: "flex", gap: 0, borderTop: `1px solid ${DIVIDER}`, borderBottom: `1px solid ${DIVIDER}`, marginBottom: 16 }}>
                  {[
                    profile?.height_range  && { label: "Height",      value: profile.height_range },
                    profile?.top_size      && { label: "Top size",     value: profile.top_size },
                    profile?.bottom_size   && { label: "Bottom size",  value: profile.bottom_size },
                  ].filter(Boolean).map((item: any, i, arr) => (
                    <div key={item.label} style={{ flex: 1, padding: "14px 16px", borderRight: i < arr.length - 1 ? `1px solid ${DIVIDER}` : "none" }}>
                      <p style={{ fontSize: 15, letterSpacing: "0.2em", textTransform: "uppercase", color: MUTED, marginBottom: 6 }}>{item.label}</p>
                      <p style={{ fontSize: 15, fontWeight: 600, color: PRIMARY }}>{item.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Fit tags */}
              {allTags.length > 0 && (
                <div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    {visibleTags.map((tag, i) => (
                      <span key={i} style={{ fontSize: 16, color: SECONDARY, background: PILL_BG, border: `1px solid ${PILL_BDR}`, borderRadius: 100, padding: "6px 14px" }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  {allTags.length > 5 && (
                    <button onClick={() => setShowAllTags(v => !v)}
                      style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 16, color: ACCENT, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      {showAllTags ? <><ChevronUp style={{ width: 13, height: 13 }} /> Show less</> : <><ChevronDown style={{ width: 13, height: 13 }} /> {allTags.length - 5} more</>}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button onClick={openSilhouetteEdit}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "18px 20px", borderRadius: 14, border: `1px dashed ${PILL_BDR}`, background: "transparent", cursor: "pointer", boxSizing: "border-box" }}>
              <span style={{ fontSize: 16, color: MUTED }}>Set your body type</span>
              <span style={{ fontSize: 15, color: ACCENT }}>+ Add</span>
            </button>
          )}
        </motion.div>

        {/* ══════════════════════════════════════════════════════════════════
            CARD 4 — Aesthetic
        ══════════════════════════════════════════════════════════════════ */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}
          style={{ background: CARD_BG, borderRadius: 20, marginBottom: 12, padding: "28px 28px 24px" }}>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <p style={{ fontSize: 16, letterSpacing: "0.3em", textTransform: "uppercase", color: MUTED }}>Aesthetic</p>
            {editMode !== "style" && (profile?.style_aesthetics?.length ?? 0) > 0 && (
              <button onClick={openStyleEdit} style={{ fontSize: 16, color: ACCENT, background: "none", border: "none", cursor: "pointer" }}>Edit</button>
            )}
          </div>

          {editMode === "style" ? (
            <div>
              <p style={{ fontSize: 15, color: MUTED, marginBottom: 16 }}>Select up to 3 aesthetics</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                {STYLE_OPTIONS.map(opt => {
                  const sel = editStyle.includes(opt.label);
                  return (
                    <button key={opt.label} onClick={() => toggleStyle(opt.label)}
                      style={{ borderRadius: 14, border: `1px solid ${sel ? ACCENT : PILL_BDR}`, overflow: "hidden", cursor: "pointer", background: "transparent", opacity: !sel && editStyle.length >= 3 ? 0.3 : 1, transition: "all 0.15s", padding: 0 }}>
                      <div style={{ position: "relative" }}>
                        <img src={opt.image} alt={opt.label} style={{ width: "100%", height: 130, objectFit: "cover", objectPosition: "top", display: "block" }} />
                        {sel && <div style={{ position: "absolute", top: 8, right: 8, width: 20, height: 20, borderRadius: "50%", background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Check style={{ width: 11, height: 11, color: "white" }} />
                        </div>}
                      </div>
                      <div style={{ padding: "7px 10px", background: "white" }}>
                        <p style={{ fontSize: 16, fontWeight: 500, color: PRIMARY }}>{opt.label}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={saveStyle} disabled={!editStyle.length || savingProfile} style={{ ...btnPrimary, flex: 1, opacity: (!editStyle.length || savingProfile) ? 0.4 : 1 }}>{savingProfile ? "Saving..." : "Save"}</button>
                <button onClick={() => setEditMode(null)} style={btnSecondary}>Cancel</button>
              </div>
            </div>
          ) : (profile?.style_aesthetics?.length ?? 0) > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {profile.style_aesthetics.map((label: string) => {
                const opt = STYLE_OPTIONS.find(s => s.label === label);
                return opt ? (
                  <div key={label} style={{ borderRadius: 14, overflow: "hidden", position: "relative" }}>
                    <img src={opt.image} alt={label} style={{ width: "100%", height: 260, objectFit: "cover", objectPosition: "top", display: "block" }} />
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "28px 10px 10px", background: "linear-gradient(to top, rgba(0,0,0,0.58), transparent)" }}>
                      <p style={{ fontSize: 16, color: "white", fontWeight: 700, textAlign: "center", letterSpacing: "0.05em" }}>{label}</p>
                    </div>
                  </div>
                ) : null;
              })}
            </div>
          ) : (
            <button onClick={openStyleEdit}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "18px 20px", borderRadius: 14, border: `1px dashed ${PILL_BDR}`, background: "transparent", cursor: "pointer", boxSizing: "border-box" }}>
              <span style={{ fontSize: 16, color: MUTED }}>Set your aesthetic</span>
              <span style={{ fontSize: 15, color: ACCENT }}>+ Add</span>
            </button>
          )}
        </motion.div>

        {/* ══════════════════════════════════════════════════════════════════
            CARD 5 — Recent decisions
        ══════════════════════════════════════════════════════════════════ */}
        {recentDecisions.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
            style={{ background: CARD_BG, borderRadius: 20, padding: "28px 28px 8px" }}>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <p style={{ fontSize: 16, letterSpacing: "0.3em", textTransform: "uppercase", color: MUTED }}>Recent decisions</p>
              <button onClick={() => navigate("/feed")}
                style={{ fontSize: 16, color: ACCENT, background: "none", border: "none", cursor: "pointer" }}>
                View all →
              </button>
            </div>

            {recentDecisions.map((d, i) => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 16, paddingBottom: 20, marginBottom: i < recentDecisions.length - 1 ? 0 : 0, borderBottom: i < recentDecisions.length - 1 ? `1px solid ${DIVIDER}` : "none", marginTop: i > 0 ? 20 : 0 }}>
                {/* Thumbnail */}
                <div style={{ width: 52, height: 64, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: PILL_BG }}>
                  {d.product_image_url
                    ? <img src={d.product_image_url} alt={d.product_name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
                    : <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, rgba(142,58,58,0.10), rgba(142,58,58,0.04))` }} />
                  }
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {d.brand_name && (
                    <p style={{ fontSize: 16, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, marginBottom: 3 }}>
                      {d.brand_name}
                    </p>
                  )}
                  <p style={{ fontSize: 15, fontWeight: 600, color: PRIMARY, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>
                    {d.product_name ?? "Untitled item"}
                  </p>
                  {d.uncertainty_text && (
                    <p style={{ fontSize: 16, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      "{d.uncertainty_text}"
                    </p>
                  )}
                </div>

                {/* Status + date */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end", marginBottom: 4 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: d.status === "open" ? "#16a34a" : d.status === "purchased" ? ACCENT : MUTED }} />
                    <span style={{ fontSize: 16, fontWeight: 600, color: SECONDARY }}>
                      {d.status === "open" ? "Open" : d.status === "purchased" ? "Bought" : d.status ?? "Open"}
                    </span>
                  </div>
                  <p style={{ fontSize: 15, color: MUTED }}>{timeAgo(d.created_at)}</p>
                </div>
              </div>
            ))}
          </motion.div>
        )}

      </div>
      )}{/* end overview tab */}

      </div>
      </div>{/* end scrollable content */}
    </div>
  );
};

export default Profile;
