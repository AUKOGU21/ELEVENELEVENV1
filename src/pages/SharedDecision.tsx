// ── SharedDecision ────────────────────────────────────────────────────────────
// A decision at its own address, /d/:id, so it can travel through a message and
// still be answerable at the other end.
//
// The recipient came for one reason: someone wants her opinion. So this is the
// ask, what it is about, and a way to answer. No feed, no nav, nothing to
// explore. Signing in is never required to read it or to answer it.
//
// The feed's own overlay is untouched. This is a second door into the same
// decision, not a second kind of decision.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Check, Share } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useViewport } from "@/pages/Profile";
import { C, RADIUS, SANS, body, display, meta, strong } from "@/lib/design";
import { formatName } from "@/lib/format";
import { imageToJpeg } from "@/lib/image";
import { track } from "@/lib/track";
import WeighInSheet, { type WeighInPayload } from "@/components/WeighInSheet";
import ResponseItem, { type ResponseItemData } from "@/components/ResponseItem";

type SharedDecisionRow = {
  id: string;
  user_id: string;
  created_at: string;
  status: string | null;
  post_type: string | null;
  product_name: string | null;
  brand_name: string | null;
  product_url: string | null;
  product_image_url: string | null;
  product_price: number | null;
  price_note: string | null;
  confidence_score: number | null;
  uncertainty_text: string | null;
  context_note: string | null;
  sizes_note: string | null;
  lf_title: string | null;
  profiles: { display_name: string | null; avatar_url: string | null; city: string | null; badge_tier?: string | null } | null;
  responses: ResponseItemData[] | null;
};

const SELECT = `
  id, user_id, created_at, status, post_type,
  product_name, brand_name, product_url, product_image_url, product_price, price_note,
  confidence_score, uncertainty_text, context_note, sizes_note, lf_title,
  profiles ( display_name, avatar_url, city, badge_tier ),
  responses ( id, recommendation, reasoning, photo_url, product_url, match_score,
              personal_experience, helpfulness_votes, user_id, guest_id, created_at,
              profiles ( display_name, avatar_url, badge_tier ),
              guests ( first_name, last_initial ) )
`;

/** Concerns as she wrote them: the label, and the detail underneath it. */
function parseConcerns(d: SharedDecisionRow) {
  const labels = (d.uncertainty_text ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ctx: Record<string, string> = {};
  (d.context_note ?? "").split(" · ").forEach((note) => {
    const i = note.indexOf(": ");
    if (i > -1) ctx[note.slice(0, i).trim().toLowerCase()] = note.slice(i + 2).trim();
  });
  const sizes = (d.sizes_note ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return labels.map((label) => {
    const l = label.toLowerCase();
    const key = Object.keys(ctx).find((k) => l.includes(k) || k.includes(l));
    return { label, detail: key ? ctx[key] : null, sizes: l.includes("between sizes") ? sizes : [] };
  });
}

const firstNameOf = (n: string | null | undefined) => (n || "").trim().split(/\s+/)[0] || "She";

export default function SharedDecision() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isMobile } = useViewport();

  const [d, setD] = useState<SharedDecisionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // The sheet holds her draft while dismissed; bumping this throws it away.
  const [resetKey, setResetKey] = useState(0);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("decisions")
      .select(SELECT)
      .eq("id", id)
      .eq("is_public", true)
      .is("deleted_at", null)
      .maybeSingle();
    setD((data as SharedDecisionRow) ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // One open is one event, whoever opened it.
  useEffect(() => {
    if (!d) return;
    track("shared_decision_opened", { decisionId: d.id, userId: user?.id ?? null });
  }, [d?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const concerns = useMemo(() => (d ? parseConcerns(d) : []), [d]);

  if (loading || authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: C.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={meta(11)}>Loading...</p>
      </div>
    );
  }

  // Deleted, private, or never existed. One honest message, and a way onward.
  if (!d) {
    return (
      <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: SANS, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <p style={{ ...meta(11, C.burgundy), fontWeight: 700 }}>ELEVENELEVEN</p>
          <h1 style={{ ...display(isMobile ? 34 : 44), marginTop: 16 }}>This decision isn't here.</h1>
          <p style={{ ...body(15, C.inkSoft), marginTop: 12 }}>
            The link may be wrong, or she may have taken the post down.
          </p>
          <button onClick={() => navigate("/")} style={{ ...meta(12, "#FFFFFF"), fontWeight: 700, letterSpacing: "0.16em", background: C.burgundy, border: "none", borderRadius: RADIUS, padding: "15px 24px", marginTop: 24, cursor: "pointer" }}>
            See ElevenEleven
          </button>
        </div>
      </div>
    );
  }

  const name = firstNameOf(d.profiles?.display_name);
  const isOwn = !!user && user.id === d.user_id;
  const decided = d.status === "closed" || d.status === "purchased";
  const isLF = d.post_type === "looking_for";
  const responses = (d.responses ?? []).filter((r) => r);
  const alreadyIn = !!user && responses.some((r) => r.user_id === user.id);
  const price = d.price_note ?? (d.product_price != null ? `$${d.product_price}` : null);
  const canWeighIn = !decided && !isOwn && !alreadyIn;

  const share = async () => {
    const url = `${window.location.origin}/d/${d.id}`;
    track("decision_share_clicked", { decisionId: d.id, userId: user?.id ?? null });
    const text = `${name} wants your take`;
    try {
      if (navigator.share) { await navigator.share({ title: text, text, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch { /* she cancelled the sheet, which is not an error */ }
  };

  const openSheet = () => {
    setError(null);
    setSheetOpen(true);
    track(user ? "weigh_in_start" : "guest_weigh_in_started", { decisionId: d.id, userId: user?.id ?? null });
  };

  const submit = async (p: WeighInPayload) => {
    setSubmitting(true);
    setError(null);
    try {
      if (user) {
        // A member answering from a shared link is just a member answering.
        let photoUrl: string | null = null;
        if (p.photo) {
          let blob: Blob = p.photo;
          try { blob = await imageToJpeg(p.photo); } catch { /* upload the original */ }
          const path = `response-photos/${user.id}/${Date.now()}.jpg`;
          const { data: up } = await supabase.storage.from("product-images").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
          if (up) photoUrl = supabase.storage.from("product-images").getPublicUrl(up.path).data.publicUrl;
        }
        const { error: insErr } = await supabase.from("responses").insert({
          decision_id: d.id,
          user_id: user.id,
          recommendation: p.vote,
          reasoning: p.take,
          personal_experience: p.context,
          ...(photoUrl ? { photo_url: photoUrl } : {}),
          ...(p.link ? { product_url: p.link } : {}),
        });
        if (insErr) throw new Error(insErr.message);
        supabase.functions.invoke("notify-weigh-in", { body: { decision_id: d.id, responder_id: user.id } })
          .catch((e) => console.warn("weigh-in notify failed:", e));
        setSubmitted(true);
        await load();
      } else {
        // Guests never write to the database directly: the edge function checks
        // the decision can still take answers, then writes with its own rights.
        const { data, error: fnErr } = await supabase.functions.invoke("guest-weigh-in", {
          body: {
            decision_id: d.id,
            first_name: p.firstName,
            last_initial: p.lastInitial || null,
            recommendation: p.vote,
            reasoning: p.take,
            personal_experience: p.context,
            product_url: p.link,
            source: "share",
          },
        });
        if (fnErr) throw new Error(fnErr.message);
        const guestId = (data as { guest_id?: string } | null)?.guest_id ?? null;
        if (guestId) { try { localStorage.setItem("ee_guest_id", guestId); } catch { /* private mode */ } }
        track("guest_response_submitted", { decisionId: d.id, guestId });
        setSubmitted(true);
        await load();
      }
    } catch (e) {
      setError((e as Error).message || "That didn't send. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const label = (t: string) => <p style={{ ...meta(10.5, C.muted), marginBottom: 8 }}>{t}</p>;

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: SANS }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: isMobile ? "22px 18px 120px" : "40px 24px 140px" }}>
        {/* Who is asking, and what for. The whole reason she tapped the link. */}
        <p style={{ ...meta(11, C.burgundy), fontWeight: 700 }}>ELEVENELEVEN</p>
        <h1 style={{ ...display(isMobile ? "clamp(34px, 11vw, 46px)" : 54), marginTop: 14 }}>
          {decided ? `${name} made her decision.` : isLF ? `${name} is looking for something.` : `${name} wants your take.`}
        </h1>

        {d.product_image_url && (
          <div style={{ background: C.well, aspectRatio: "4 / 5", marginTop: 22, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <img src={d.product_image_url} alt="" style={{ maxWidth: "88%", maxHeight: "88%", objectFit: "contain", mixBlendMode: "multiply" }} />
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          {isLF ? (
            <h2 style={{ ...display(isMobile ? 26 : 30) }}>{d.lf_title}</h2>
          ) : (
            <>
              {d.brand_name && <p style={{ ...strong(isMobile ? 14 : 15), textTransform: "uppercase", letterSpacing: "0.05em" }}>{d.brand_name}</p>}
              {d.product_name && <p style={{ ...body(isMobile ? 15 : 16, C.inkSoft), marginTop: 4 }}>{d.product_name}</p>}
            </>
          )}
          {price && <p style={{ ...body(15, C.ink), marginTop: 8 }}>{price}</p>}
        </div>

        {/* What she is unsure about, with whatever she added underneath it. */}
        {concerns.length > 0 && (
          <div style={{ marginTop: 28, borderTop: `1px solid ${C.rule}` }}>
            {concerns.map((c) => (
              <div key={c.label} style={{ padding: "16px 0", borderBottom: `1px solid ${C.rule}` }}>
                <p style={{ ...strong(isMobile ? 14.5 : 15.5) }}>{c.label}</p>
                {c.detail && <p style={{ ...body(14, C.inkSoft), marginTop: 6 }}>{c.detail}</p>}
                {c.sizes.length > 0 && <p style={{ ...meta(10.5, C.muted), marginTop: 8 }}>{c.sizes.join("  /  ")}</p>}
              </div>
            ))}
          </div>
        )}

        {d.confidence_score != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 22 }}>
            {label("How sure she is")}
            <p style={{ ...display(isMobile ? 26 : 30), marginTop: -8 }}>{d.confidence_score}/10</p>
          </div>
        )}

        {/* Answers so far, drawn exactly as they are inside the app. */}
        {responses.length > 0 && (
          <div style={{ marginTop: 34 }}>
            <p style={{ ...meta(11, C.ink), fontWeight: 700, borderBottom: `2px solid ${C.burgundy}`, display: "inline-block", paddingBottom: 6 }}>
              Responses ({responses.length})
            </p>
            <div style={{ marginTop: 6 }}>
              {responses.map((r) => (
                <ResponseItem
                  key={r.id}
                  resp={r}
                  user={user ? { id: user.id } : null}
                  isMobile={isMobile}
                  helpfulCount={r.helpfulness_votes ?? 0}
                  myVote={undefined}
                  // Voting and replying are conversation, and this page is for
                  // answering. Both stay in the app.
                  canVote={false}
                  onHelpful={() => {}}
                  onSubmitReply={async () => {}}
                  onDeleteReply={async () => {}}
                  onEditReply={async () => {}}
                  onSignIn={() => navigate("/signin?mode=signup")}
                />
              ))}
            </div>
          </div>
        )}

        {decided && (
          <p style={{ ...body(15, C.inkSoft), marginTop: 30, paddingTop: 20, borderTop: `1px solid ${C.rule}` }}>
            She's already decided this one, so it's closed for new takes.
          </p>
        )}
      </div>

      {/* The ask, always reachable without scrolling back. */}
      {(canWeighIn || !decided) && (
        <div style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
          background: C.paper, borderTop: `1px solid ${C.rule}`,
          padding: isMobile ? "12px 18px 18px" : "14px 24px 20px",
        }}>
          <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", gap: 10 }}>
            {canWeighIn ? (
              <button onClick={openSheet} style={{ ...meta(12, "#FFFFFF"), fontWeight: 700, letterSpacing: "0.16em", flex: 1, background: C.burgundy, border: `1px solid ${C.burgundy}`, borderRadius: RADIUS, padding: "16px 0", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                Weigh in <ArrowRight style={{ width: 15, height: 15 }} strokeWidth={2} />
              </button>
            ) : (
              <span style={{ ...meta(11, C.muted), flex: 1, alignSelf: "center" }}>
                {isOwn ? "This is your decision." : alreadyIn ? "You've already weighed in." : ""}
              </span>
            )}
            <button onClick={share} aria-label="Share this decision" style={{ ...meta(11, C.ink), fontWeight: 700, background: "transparent", border: `1px solid ${C.ink}`, borderRadius: RADIUS, padding: "0 18px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
              {copied ? <><Check style={{ width: 14, height: 14 }} /> Copied</> : <><Share style={{ width: 14, height: 14 }} /> Share</>}
            </button>
          </div>
        </div>
      )}

      <WeighInSheet
        open={sheetOpen}
        isMobile={isMobile}
        decisionId={d.id}
        resetKey={resetKey}
        decision={d}
        mode={user ? "member" : "guest"}
        submitting={submitting}
        error={error}
        submitted={submitted}
        onCancel={() => { setSheetOpen(false); setResetKey((k) => k + 1); }}
        onDismiss={() => setSheetOpen(false)}
        onSubmit={submit}
        doneSlot={
          <div style={{ padding: "6px 0 2px" }}>
            <h3 style={display(isMobile ? 38 : 48)}>Your take is in.</h3>
            <p style={{ ...body(15, C.inkSoft), marginTop: 12 }}>
              {name} can now see your response.
            </p>
            {!user && (
              <>
                <div style={{ borderTop: `1px solid ${C.rule}`, margin: "24px 0 20px" }} />
                <p style={{ ...strong(15.5) }}>You clearly have opinions. We like that.</p>
                <p style={{ ...body(14.5, C.inkSoft), marginTop: 8 }}>
                  Make a profile to keep your responses and get matched to decisions you can actually help with.
                </p>
                <button
                  onClick={() => {
                    track("guest_signup_started", { decisionId: d.id, guestId: (() => { try { return localStorage.getItem("ee_guest_id"); } catch { return null; } })() });
                    navigate("/signin?mode=signup");
                  }}
                  style={{ ...meta(12, "#FFFFFF"), fontWeight: 700, letterSpacing: "0.16em", width: "100%", background: C.burgundy, border: `1px solid ${C.burgundy}`, borderRadius: RADIUS, padding: "16px 0", marginTop: 20, cursor: "pointer" }}
                >
                  Create my profile
                </button>
              </>
            )}
            <button
              onClick={() => { setSheetOpen(false); setSubmitted(false); setResetKey((k) => k + 1); }}
              style={{ ...meta(12, C.ink), fontWeight: 700, letterSpacing: "0.16em", width: "100%", background: "transparent", border: `1px solid ${C.ink}`, borderRadius: RADIUS, padding: "15px 0", marginTop: 10, cursor: "pointer" }}
            >
              {user ? "Done" : "Not now"}
            </button>
          </div>
        }
      />
    </div>
  );
}
