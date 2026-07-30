// ── Shared feed formatting helpers ────────────────────────────────────────────
// Small, dependency-free formatters shared across the feed cards and the response
// / recommendation drawers. Kept in one place so the drawer components can render
// responses identically to the cards without importing from the 2,800-line Feed.

export const timeAgo = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const formatName = (displayName: string | null | undefined): string => {
  if (!displayName) return "Anonymous";
  const parts = displayName.trim().split(" ");
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
};

export const getInitials = (displayName: string | null | undefined): string => {
  if (!displayName) return "?";
  const parts = displayName.trim().split(" ");
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

export const recommendationLabel = (rec: string): string => {
  if (rec === "buy") return "Would buy";
  if (rec === "do_not_buy") return "Wouldn't buy";
  return "Depends";
};

// Budget shows as "$XX" when it's a bare number; descriptive budgets
// ("Under $150", "$100–200") are left untouched.
export const formatBudget = (s: string | null | undefined): string => {
  const t = (s || "").trim();
  if (!t) return "";
  if (/^\d[\d,]*(\.\d+)?$/.test(t)) return `$${t}`;
  return t;
};

export const prettyHost = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
