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
  AskMeAbout, DecisionsBlock, EmptyNote, FitSummary, IrlPhotos, Lightbox, Portrait,
  ProfileFooter, ProfileHeader, ProfileTabs, ProfileTop, StatsRow, TierStatus, StyleRow, TILE_FIELDS, fitPhotosFor, helpfulStats,
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
  const [tab, setTab]               = useState("fit");

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
    <button onClick={() => navigate("/signin")} style={{ ...textLink(C.ink), fontSize: isMobile ? 10.5 : 12, whiteSpace: "nowrap" }}>Sign in</button>
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
  const tier      = tierFor(stats.helpfulVotes)?.label ?? profile.badge_tier ?? null;
  const sil       = silhouetteFor(profile);
  const fitPhotos = fitPhotosFor(profile);
  const styles: string[] = profile.style_aesthetics ?? [];
  const isOwner   = !!user && user.id === userId;

  // Follow (or Edit, on her own) in the top right corner.
  const actions = (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {isOwner ? (
        <button onClick={() => navigate("/profile")} style={{ ...squareBtn(false), fontSize: 11, padding: isMobile ? "10px 16px" : "12px 20px" }}>Edit</button>
      ) : userId ? (
        <FollowButton
          targetUserId={userId}
          user={user}
          following={following}
          onChange={(_, on) => setFollowing(on)}
          onSignIn={() => navigate("/signin?mode=signup")}
          size="md"
          variant="editorial"
        />
      ) : null}
    </div>
  );

  // Her standing beside the photo, and how closely she matches you.
  const status = (
    <TierStatus tier={tier}>
      {matchScore !== null && <MatchSeal score={matchScore} size={isMobile ? 40 : 52} withLabel labelSize={10.5} />}
    </TierStatus>
  );

  const askItems: string[] = Array.isArray(profile.ask_me_about) ? profile.ask_me_about : [];

  return (
    <div className="fixed inset-0 overflow-hidden flex justify-center" style={{ background: C.paper, color: C.ink }}>

      <AnimatePresence>
        {lightboxIdx !== null && fitPhotos[lightboxIdx] && (
          <Lightbox key="lightbox" photos={fitPhotos} index={lightboxIdx} onIndex={setLightboxIdx} onClose={() => setLightboxIdx(null)} />
        )}
      </AnimatePresence>

      {/* The page scrolls inside this, the way the feed does. iOS leaves blank
          tiles behind when a document with a fixed header scrolls itself, which
          is the cream slab that covered the profile. */}
      <div className="w-full max-w-[1320px] no-scrollbar" style={{ overflowY: "scroll", overscrollBehavior: "contain" }}>
      <ProfileHeader isMobile={isMobile} right={headerRight} />

      <main style={wrap(isMobile)}>
        {back}

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{ marginTop: isMobile ? 14 : 28 }}>
          <ProfileTop
            isMobile={isMobile}
            isWide={isWide}
            name={name}
            facts={[profile.age, profile.city?.split(",")[0]].filter(Boolean)}
            since={profile.created_at}
            status={status}
            bio={profile.bio}
            portrait={<Portrait url={profile.avatar_url ?? null} name={name} tier={tier} />}
            actions={actions}
            irl={fitPhotos.length > 0 ? <IrlPhotos label={`${first}, IRL`} photos={fitPhotos} onOpen={setLightboxIdx} /> : null}
            askAbout={askItems.length > 0 ? <AskMeAbout items={askItems} isMobile={isMobile} /> : null}
          />
        </div>

        {/* ── Fit profile / Style / Decisions ──────────────────────────────── */}
        {/* No Mirrors here: her mirrors are hers to see. */}
        <div style={{ marginTop: isMobile ? 32 : 56 }}>
          <ProfileTabs isMobile={isMobile} active={tab} onChange={setTab} tabs={[
            {
              key: "fit",
              label: "Fit profile",
              content: sil ? <FitSummary profile={profile} isMobile={isMobile} /> : <EmptyNote text={`${first} hasn't set her fit profile yet.`} />,
            },
            {
              key: "style",
              label: "Style",
              content: styles.length > 0 ? <StyleRow labels={styles} isMobile={isMobile} /> : <EmptyNote text={`${first} hasn't picked her aesthetic yet.`} />,
            },
            {
              key: "decisions",
              label: "Decisions",
              content: (
                <>
                  <StatsRow decisions={decisions?.length ?? 0} takes={stats.takes} helpful={stats.helpfulVotes} isMobile={isMobile} />
                  <div style={{ marginTop: isMobile ? 26 : 36 }}>
                    <DecisionsBlock
                      bare
                      heading={`${first}'s decisions`}
                      decisions={decisions}
                      viewerId={user?.id ?? null}
                      isMobile={isMobile}
                      onOpen={(id) => navigate("/feed", { state: { openDecisionId: id } })}
                      empty={<EmptyNote text={`${first} hasn't shared a public decision yet.`} />}
                    />
                  </div>
                </>
              ),
            },
          ]} />
        </div>

        <ProfileFooter isMobile={isMobile} />
      </main>
      </div>
    </div>
  );
};

export default PublicProfile;
