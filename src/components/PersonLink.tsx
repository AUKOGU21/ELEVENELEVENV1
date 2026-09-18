// ── PersonLink ────────────────────────────────────────────────────────────────
// Anywhere a woman's name appears on a post, it goes to her profile. A match
// percentage is only useful if you can see who it belongs to: "she's a medium,
// how does that compare to me" is the whole question.
//
// The arrow is the point. On a phone there is no hover to discover, so the
// affordance has to be visible standing still.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { C, strong } from "@/lib/design";
import { formatName } from "@/lib/format";

/** Her name, as a link to her profile. Falls back to plain text when unknown. */
export function PersonName({ userId, name, size = 12.5 }: {
  userId: string | null | undefined;
  name: string | null | undefined;
  size?: number;
}) {
  const [hover, setHover] = useState(false);
  const label = formatName(name);
  const type: React.CSSProperties = {
    ...strong(size), textTransform: "uppercase", letterSpacing: "0.05em",
  };

  if (!userId) return <span style={type}>{label}</span>;

  return (
    <Link
      to={`/profile/${userId}`}
      title={`See ${label}'s profile`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        textDecoration: "none", color: "inherit", minWidth: 0,
      }}
    >
      <span style={{ ...type, textDecoration: hover ? "underline" : "none" }}>{label}</span>
      <ArrowUpRight style={{ width: 12, height: 12, color: hover ? C.ink : C.muted, flexShrink: 0 }} strokeWidth={2} />
    </Link>
  );
}
