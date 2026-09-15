import { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { computeMatchScore } from "@/lib/matching";
import FollowButton from "@/components/FollowButton";
import MatchSeal from "@/components/MatchSeal";
import { Avatar } from "@/components/DecisionTile";
import { tierFor } from "@/lib/tiers";
import { track } from "@/lib/track";
import { C, body, meta } from "@/lib/design";
// The layout and read-only sections are shared with her own profile page.
import {
  BigName, DecisionsBlock, EmptyNote, FitSummary, Hero, HeroEyebrow, IrlPhotos, Lightbox, Portrait,
  ProfileFooter, ProfileHeader, Section, StatsRow, StyleRow, TILE_FIELDS, fitPhotosFor, helpfulStats,
  nameParts, silhouetteFor, squareBtn, textLink, useViewport, withTileExtras, wrap, type ProfileTile,
} from "./Profile";

const PublicProfile = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate   = useNavigate();
  const location   = useLocation();
  const { user }   = useAuth();
  const { isMobile, isWide } = useViewport();
  const [following, setFollowing] = useState(false);

  // Opening this page from a push notification launches straight onto it, so
  // there is no history entry to go back to and navigate(-1) does nothing.
  // react-router marks that first entry with key "default".
  const goBack = () => {
    if (location.key === "default") navigate("/feed");
    else navigate(-1);
  };

  useEffect(() => { if (userId) track("profile_open", { userId: user?.id ?? null, meta: { viewed: userId } }); }, [userId, user]);

  // Am I following her? Ids only, no counts.
  useEffect(() => {
    if (!user || !userId || user.id === userId) { setFollowing(false); return; }
    let cancelled = false;
    supabase.from("follows").select("following_id")
      .eq("follower_id", user.id).eq("following_id", userId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setFollowing(!!data); });
    return () => { cancelled = true; };
  }, [user, userId]);

  const [profile, setProfile]       = useState<any>(null);
  const [viewer, setViewer]         = useState<any>(null);
  const [stats, setStats]           = useState({ takes: 0, helpfulVotes: 0 });
  const [decisions, setDecisions]   = useState<ProfileTile[] | null>(null);
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [loading, setLoading]       = useState(true);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const [profRes, decRes, helpful, mine] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        // Her public decisions only.
        supabase.from("decisions").select(TILE_FIELDS)
          .eq("user_id", userId).eq("is_public", true).is("deleted_at", null)
          .order("created_at", { ascending: false }),
        // Counted from response_votes, the same way as her own profile, so the
        // tier and "Marked helpful" agree on both pages.
        helpfulStats(userId),
        user
          ? supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then((r) => r.data as any)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      const prof = (profRes as any).data ?? null;
      setProfile(prof);
      setViewer(mine ?? null);
      setStats({ takes: helpful.responses, helpfulVotes: helpful.helpfulVotes });
      // Match only for a signed-in viewer looking at someone else.
      setMatchScore(prof && mine && user && user.id !== userId ? Math.round(computeMatchScore(mine, prof).total) : null);
      setLoading(false);
      const tiles = await withTileExtras((decRes as any).data ?? []);
      if (!cancelled) setDecisions(tiles);
    })();
    return () => { cancelled = true; };
  }, [userId, user]);

  const headerRight = user ? (
    <button onClick={() => navigate("/profile")} aria-label="Your profile" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", lineHeight: 0 }}>
      <Avatar url={viewer?.avatar_url ?? null} name={viewer?.display_name ?? null} tier={viewer?.badge_tier} size={isMobile ? 30 : 36} />
    </button>
  ) : (
    <button onClick={() => navigate("/signin")} style={{ ...textLink(C.ink), fontSize: isMobile ? 10 : 11, whiteSpace: "nowrap" }}>Sign in</button>
  );

  const back = (
    <button onClick={goBack} style={{ ...textLink(C.muted), marginTop: isMobile ? 16 : 28 }}>
      <ArrowLeft style={{ width: 14, height: 14 }} strokeWidth={2} /> Back
    </button>
  );

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={meta(11)}>Loading...</p>
    </div>
  );

  if (!profile) return (
    <div style={{ minHeight: "100vh", background: C.paper }}>
      <ProfileHeader isMobile={isMobile} right={headerRight} />
      <main style={wrap(isMobile)}>
        {back}
        <p style={{ ...body(15), marginTop: 24 }}>Profile not found.</p>
      </main>
    </div>
  );

  const name      = profile.display_name?.trim() || "Anonymous";
  const first     = nameParts(name)[0] ?? name;
  const tier      = tierFor(stats.helpfulVotes)?.label ?? null;
  const sil       = silhouetteFor(profile);
  const fitPhotos = fitPhotosFor(profile);
  const styles: string[] = profile.style_aesthetics ?? [];
  const isOwner   = !!user && user.id === userId;

  const identity = (
    <div>
      <HeroEyebrow tier={tier} since={profile.created_at} />
      <div style={{ marginTop: 16 }}><BigName name={name} isMobile={isMobile} /></div>
      {(profile.age || profile.city) && (
        <p style={{ ...meta(12, C.inkSoft), marginTop: 16 }}>
          {[profile.age, profile.city?.split(",")[0]].filter(Boolean).join(" · ")}
        </p>
      )}
      {profile.bio && (
        <p style={{ ...body(isMobile ? 14.5 : 15.5), marginTop: 14, maxWidth: "42ch", whiteSpace: "pre-line" }}>{profile.bio}</p>
      )}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 16, marginTop: 24 }}>
        {isOwner ? (
          <button onClick={() => navigate("/profile")} style={squareBtn(false)}>Edit profile</button>
        ) : userId ? (
          <FollowButton
            targetUserId={userId}
            user={user}
            following={following}
            onChange={(_, on) => setFollowing(on)}
            onSignIn={() => navigate("/signin")}
            size="md"
            variant="editorial"
          />
        ) : null}
        {matchScore !== null && <MatchSeal score={matchScore} size={isMobile ? 48 : 56} withLabel labelSize={10.5} />}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink }}>

      <AnimatePresence>
        {lightboxIdx !== null && fitPhotos[lightboxIdx] && (
          <Lightbox key="lightbox" photos={fitPhotos} index={lightboxIdx} onIndex={setLightboxIdx} onClose={() => setLightboxIdx(null)} />
        )}
      </AnimatePresence>

      <ProfileHeader isMobile={isMobile} right={headerRight} />

      <main style={wrap(isMobile)}>
        {back}

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div style={{ marginTop: isMobile ? 16 : 28 }}>
          <Hero
            isMobile={isMobile}
            isWide={isWide}
            portrait={<Portrait url={profile.avatar_url ?? null} name={name} />}
            identity={identity}
            irl={fitPhotos.length > 0 ? <IrlPhotos label={`${first}, IRL`} photos={fitPhotos} onOpen={setLightboxIdx} /> : null}
          />
        </div>

        {/* ── Stats and standing ───────────────────────────────────────────── */}
        <div style={{ marginTop: isMobile ? 36 : 56 }}>
          <StatsRow decisions={decisions?.length ?? 0} takes={stats.takes} helpful={stats.helpfulVotes} isMobile={isMobile} />
        </div>

        {/* ── Fit profile ──────────────────────────────────────────────────── */}
        {sil && (
          <Section title="Fit profile" rail={isWide} isMobile={isMobile}>
            <FitSummary profile={profile} isMobile={isMobile} />
          </Section>
        )}

        {/* ── Style ────────────────────────────────────────────────────────── */}
        {styles.length > 0 && (
          <Section title="Style" rail={isWide} isMobile={isMobile}>
            <StyleRow labels={styles} isMobile={isMobile} />
          </Section>
        )}

        {/* ── Decisions ────────────────────────────────────────────────────── */}
        <DecisionsBlock
          heading={`${first}'s decisions`}
          decisions={decisions}
          viewerId={user?.id ?? null}
          isMobile={isMobile}
          onOpen={(id) => navigate("/feed", { state: { openDecisionId: id } })}
          empty={<EmptyNote text={`${first} hasn't shared a public decision yet.`} />}
        />

        <ProfileFooter isMobile={isMobile} />
      </main>
    </div>
  );
};

export default PublicProfile;
