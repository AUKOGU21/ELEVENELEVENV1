// ── Terms of Use and Privacy Policy ───────────────────────────────────────────
// Two plain-English documents on one editorial layout. The words live here as
// data so a change to the policy is a change to text, not to markup.
//
// Keep the privacy policy true to the build: if a service provider is added or
// removed (analytics, email, hosting), or what is public changes, update
// section 1, 3 or 4 below in the same change.
import { Link } from "react-router-dom";
import { C, body, display, meta, strong } from "@/lib/design";
import { ProfileFooter, ProfileHeader, useViewport, wrap } from "./Profile";

export const EFFECTIVE_DATE = "October 7, 2026";
export const PRIVACY_EMAIL = "privacy@geteleveneleven.com";
export const LEGAL_EMAIL = "legal@geteleveneleven.com";

/** A paragraph, a bulleted list, or a paragraph that opens with a bold lead-in. */
type Block =
  | string
  | { list: string[] }
  | { lead: string; text: string }
  | { caps: string };

type Doc = { title: string; intro: Block[]; sections: { heading: string; blocks: Block[] }[] };

const PRIVACY: Doc = {
  title: "Privacy Policy",
  intro: [
    "ELEVENELEVEN (“ELEVENELEVEN,” “we,” “us,” or “our”) helps people make better purchase decisions by connecting them with people and experiences relevant to what they are considering buying.",
    "This Privacy Policy explains what information we collect when you use ELEVENELEVEN, how we use and share it, and the choices you have regarding your information.",
    "By using ELEVENELEVEN, you acknowledge the practices described in this Privacy Policy.",
  ],
  sections: [
    {
      heading: "1. Information We Collect",
      blocks: [
        { lead: "Information you provide to us.", text: "When you create an account or profile, participate in the ELEVENELEVEN community, or otherwise use our services, you may provide information such as your name, email address, age, location, profile photo, other profile information, and information about your style, preferences, sizing, proportions, product experiences, interests, or areas of knowledge." },
        "You may also provide content such as purchase decisions or questions, product information, photographs, responses to other users, recommendations, comments, and information about what you ultimately purchased, passed on, returned, kept, liked, disliked, or otherwise experienced.",
        "Some profile information is optional. You choose whether to provide optional information, although certain features may work better when we have more context about you.",
        { lead: "Information about your activity.", text: "We may collect information about how you interact with ELEVENELEVEN, including decisions you view or respond to, people you follow, responses you receive, interactions with other users, products or brands associated with your activity, and outcomes you report." },
        "This information helps us understand which experiences and people may be relevant to particular purchase decisions.",
        { lead: "Guest information.", text: "You may be able to participate in certain ELEVENELEVEN experiences without creating a full account, including responding to a decision shared with you. If you participate as a guest, we may collect information you provide, such as your name and your response, and other information necessary to facilitate that interaction." },
        { lead: "Technical and usage information.", text: "When you access ELEVENELEVEN, we and our service providers may automatically collect information such as your IP address, device and browser type, operating system, referring pages, pages or features you use, timestamps, and similar usage information." },
        "This includes session recording, which captures how you move through ELEVENELEVEN (for example, the pages you view, clicks, and scrolling) so we can find and fix problems and improve the experience. We configure session recording to hide what you type into form fields.",
        "We may use cookies, local storage, and similar technologies to operate the service, understand usage, maintain security, remember preferences, and improve ELEVENELEVEN.",
      ],
    },
    {
      heading: "2. How We Use Information",
      blocks: [
        "We may use the information we collect to:",
        { list: [
          "provide, operate, maintain, and improve ELEVENELEVEN;",
          "create and maintain your account and profile;",
          "display content and information you choose to share with other users;",
          "understand your preferences, context, and purchase experiences;",
          "identify people, experiences, responses, or information that may be relevant to a particular purchase decision;",
          "personalize and improve matching, ranking, recommendations, and other features;",
          "learn which kinds of experiences or input are useful in different purchase contexts;",
          "facilitate interactions between users;",
          "send service-related communications and notifications;",
          "understand how people use ELEVENELEVEN and develop new features;",
          "detect, investigate, and prevent fraud, abuse, security incidents, and violations of our Terms;",
          "respond to support requests and communicate with you; and",
          "comply with legal obligations and protect our rights and the rights of others.",
        ] },
        "As ELEVENELEVEN develops, we may use information generated through purchase decisions, responses, interactions, and reported outcomes to improve the systems we use to understand relevance and make the service more useful.",
        "Importantly, providing information to ELEVENELEVEN does not transfer ownership of your content to us.",
      ],
    },
    {
      heading: "3. Information You Share With the Community",
      blocks: [
        "ELEVENELEVEN is designed around people sharing knowledge and experiences with one another, and much of what you share is public.",
        "Your profile (including your name, profile photo, age, city, photos of you, fit and style information, and the topics you list under Ask me about) and the decisions, responses, recommendations, and other contributions you post can be seen by other users and by anyone with a link, including people who are not signed in. Your email address is not shown on your profile.",
        "Please consider what you choose to share. We cannot control what another person does with information they can view through the service.",
      ],
    },
    {
      heading: "4. How We Share Information",
      blocks: [
        "We may share information in the following circumstances.",
        { lead: "With other users.", text: "We share information as necessary to provide ELEVENELEVEN's community and decision-making features, consistent with the way you choose to use the service." },
        { lead: "With service providers.", text: "We use companies that help us host and operate the service, store data, provide analytics, send communications, maintain security, or perform other services on our behalf. Today these include hosting and database providers (Supabase and Vercel), email delivery (Resend), product analytics and session recording (PostHog), push notification delivery through your browser or device, location search for city suggestions, and services that fetch product details from links you share. These providers may access information only as necessary to perform services for us and subject to appropriate contractual obligations." },
        { lead: "For legal and safety reasons.", text: "We may disclose information if reasonably necessary to comply with law or legal process, enforce our agreements, investigate fraud or abuse, protect the security of ELEVENELEVEN, or protect the rights, property, or safety of ELEVENELEVEN, our users, or others." },
        { lead: "Business transactions.", text: "If ELEVENELEVEN is involved in a merger, acquisition, financing, reorganization, bankruptcy, sale of assets, or similar corporate transaction, information may be disclosed or transferred as part of that transaction, subject to applicable law." },
        { lead: "With your direction or consent.", text: "We may share information when you ask us to or otherwise consent." },
        "We do not currently sell your personal information for money or share it for cross-context behavioral advertising.",
      ],
    },
    {
      heading: "5. Data and Insights",
      blocks: [
        "One of ELEVENELEVEN's purposes is to learn from purchase experiences so that knowledge generated by one decision can make future decisions more useful.",
        "We may analyze information across the service to understand patterns such as which experiences tend to be relevant in particular contexts, which products work for different needs or preferences, and what kinds of input help people make decisions.",
        "We may create aggregated or de-identified information that does not reasonably identify an individual and use that information for research, analytics, product development, business insights, and other lawful purposes.",
        "We do not sell your identifiable profile, private purchase history, or private responses to brands.",
      ],
    },
    {
      heading: "6. Data Retention",
      blocks: [
        "We retain personal information for as long as reasonably necessary to provide ELEVENELEVEN, fulfill the purposes described in this Policy, comply with our legal obligations, resolve disputes, maintain security, and enforce our agreements.",
        "Retention periods may vary depending on the type of information and why we collected it.",
        "When information is no longer reasonably necessary, we may delete or de-identify it, subject to applicable law.",
      ],
    },
    {
      heading: "7. Your Choices and Rights",
      blocks: [
        "Depending on where you live, you may have rights regarding your personal information, including the right to request access to, correction of, or deletion of certain information.",
        "You may also be able to update certain profile information directly through your account.",
        `To make a privacy request, including a request to delete your account, contact us at ${PRIVACY_EMAIL}. We may need to verify your identity before completing certain requests.`,
        "We will not discriminate against you for exercising privacy rights provided by applicable law.",
        "California law, for example, provides qualifying consumers with rights concerning access, correction, deletion, and certain sales or sharing of personal information.",
      ],
    },
    {
      heading: "8. Security",
      blocks: [
        "We use reasonable administrative, technical, and organizational safeguards designed to protect personal information.",
        "However, no method of transmitting or storing information is completely secure, and we cannot guarantee absolute security.",
      ],
    },
    {
      heading: "9. Age Requirement",
      blocks: [
        "ELEVENELEVEN is only for people 18 and older. We do not knowingly collect personal information from anyone under 18.",
        `If we learn that we have collected personal information from someone under 18, we will delete it. If you believe someone under 18 has given us information, contact us at ${PRIVACY_EMAIL}.`,
      ],
    },
    {
      heading: "10. Third-Party Services and Links",
      blocks: [
        "ELEVENELEVEN may contain links to products, retailers, brands, websites, or other third-party services.",
        "We do not control the privacy practices of those third parties. Information you provide directly to a third party is governed by that third party's policies.",
      ],
    },
    {
      heading: "11. Changes to This Policy",
      blocks: [
        "We may update this Privacy Policy as ELEVENELEVEN evolves.",
        "If we make material changes, we will provide notice as appropriate, such as by updating the effective date, posting a notice through the service, or contacting you.",
        "Where required by law, we will obtain consent before using previously collected personal information for materially different purposes.",
      ],
    },
    {
      heading: "12. Contact Us",
      blocks: [
        "If you have questions or requests regarding this Privacy Policy or our privacy practices, contact us at:",
        `ELEVENELEVEN, Inc.\n${PRIVACY_EMAIL}`,
      ],
    },
  ],
};

const TERMS: Doc = {
  title: "Terms of Use",
  intro: [
    "Welcome to ELEVENELEVEN.",
    "These Terms of Use (“Terms”) govern your access to and use of ELEVENELEVEN's websites, applications, features, and services (collectively, the “Service”).",
    "By creating an account, accessing, or using the Service, you agree to these Terms.",
  ],
  sections: [
    {
      heading: "1. What ELEVENELEVEN Does",
      blocks: [
        "ELEVENELEVEN helps people make purchase decisions by connecting them with people, experiences, and information that may be relevant to what they are considering buying.",
        "People using ELEVENELEVEN may ask purchase questions, share product experiences, respond to other users, make recommendations, and report what they ultimately decided and how a purchase worked for them.",
        "ELEVENELEVEN facilitates access to this information. We do not guarantee that any recommendation, response, match, product, purchase, or decision will be right for you.",
      ],
    },
    {
      heading: "2. Eligibility and Accounts",
      blocks: [
        "You must be at least 18 years old and legally permitted to use the Service and enter into these Terms.",
        "You agree to provide accurate information and keep your account information reasonably current.",
        "You are responsible for maintaining the confidentiality of your login credentials and for activity conducted through your account. Notify us promptly if you believe your account has been accessed without authorization.",
      ],
    },
    {
      heading: "3. Community Conduct",
      blocks: [
        "ELEVENELEVEN depends on people sharing useful, genuine experiences.",
        "When using the Service, you agree not to:",
        { list: [
          "impersonate another person or misrepresent your identity;",
          "intentionally provide fraudulent or materially misleading information;",
          "harass, threaten, stalk, or abuse another person;",
          "post unlawful, hateful, sexually exploitative, or otherwise seriously harmful content;",
          "infringe another person's intellectual property, privacy, publicity, or other rights;",
          "manipulate interactions, responses, or outcomes;",
          "use automated systems to scrape, harvest, or access the Service without our permission;",
          "interfere with the operation or security of the Service;",
          "use ELEVENELEVEN to distribute spam, malware, scams, or unauthorized commercial solicitations; or",
          "use the Service for unlawful purposes.",
        ] },
        "We may remove content, restrict functionality, suspend accounts, or terminate access when we reasonably believe these Terms have been violated or doing so is necessary to protect ELEVENELEVEN or its community.",
      ],
    },
    {
      heading: "4. Your Content",
      blocks: [
        "You retain ownership of content you submit to ELEVENELEVEN, including photographs, purchase decisions, questions, responses, recommendations, comments, profile information, and reported outcomes (“User Content”).",
        "To operate ELEVENELEVEN, however, we need permission to use that content.",
        "You grant ELEVENELEVEN a non-exclusive, worldwide, royalty-free license to host, store, reproduce, display, distribute, modify, format, analyze, and otherwise use your User Content as reasonably necessary to operate, provide, improve, develop, and promote the Service.",
        "This license allows us, for example, to display your response to another user, show your decision through a link you choose to share, organize information within ELEVENELEVEN, improve how relevant experiences are identified, and operate features that depend on contributions from the community.",
        "You represent that you have the rights necessary to submit your User Content and grant this license.",
      ],
    },
    {
      heading: "5. How ELEVENELEVEN Uses Community Knowledge",
      blocks: [
        "ELEVENELEVEN may analyze activity and contributions across the Service (including purchase decisions, responses, product experiences, interactions, and outcomes) to improve how the Service identifies relevant people, experiences, products, and information.",
        "We may also use aggregated or de-identified information derived from use of the Service for analytics, research, product development, business intelligence, and other lawful purposes.",
        "Our handling of personal information is described in our Privacy Policy.",
      ],
    },
    {
      heading: "6. Other People's Content",
      blocks: [
        "People on ELEVENELEVEN speak from their own experiences.",
        "Unless we expressly state otherwise, User Content represents the views of the person who submitted it, not ELEVENELEVEN.",
        "We do not independently verify every statement, recommendation, product claim, purchase experience, or outcome submitted by users.",
        "You should use your own judgment when making purchasing decisions.",
      ],
    },
    {
      heading: "7. Products, Brands, and Third Parties",
      blocks: [
        "ELEVENELEVEN may display or reference products, brands, retailers, creators, or other third parties.",
        "Unless expressly stated otherwise, the appearance of a product or brand on ELEVENELEVEN does not mean that the company sponsors, endorses, or is affiliated with ELEVENELEVEN.",
        "Product availability, pricing, sizing, quality, specifications, retailer policies, and other information may change. You are responsible for confirming relevant information before completing a purchase.",
        "Third-party websites and services are governed by their own terms and policies.",
      ],
    },
    {
      heading: "8. Commercial Relationships",
      blocks: [
        "ELEVENELEVEN may develop commercial relationships with brands, retailers, creators, or other businesses.",
        "If content or recommendations are sponsored or if ELEVENELEVEN receives compensation connected to a particular transaction or recommendation, we will provide disclosures where required by applicable law.",
        "We will not represent paid promotion as independent consumer experience.",
      ],
    },
    {
      heading: "9. ELEVENELEVEN Intellectual Property",
      blocks: [
        "The Service, including its software, design, branding, logos, interfaces, features, technology, and other materials created by ELEVENELEVEN, is owned by ELEVENELEVEN or its licensors and is protected by applicable intellectual property laws.",
        "These Terms do not grant you ownership of ELEVENELEVEN's intellectual property.",
        "You may not copy, modify, distribute, sell, reverse engineer, or commercially exploit our Service except as permitted by law or with our written permission.",
      ],
    },
    {
      heading: "10. Feedback",
      blocks: [
        "If you voluntarily provide ideas, suggestions, or feedback about ELEVENELEVEN, you allow us to use that feedback without restriction or compensation to you.",
        "This does not give us ownership of User Content submitted through ordinary use of the Service.",
      ],
    },
    {
      heading: "11. Service Changes and Availability",
      blocks: [
        "ELEVENELEVEN is an evolving product.",
        "We may add, modify, test, suspend, or discontinue features or portions of the Service. We do not guarantee that the Service or any particular feature will always be available or operate without interruption.",
      ],
    },
    {
      heading: "12. Disclaimer of Warranties",
      blocks: [
        { caps: "To the maximum extent permitted by law, the Service is provided “as is” and “as available.”" },
        { caps: "ELEVENELEVEN disclaims warranties of merchantability, fitness for a particular purpose, non-infringement, and any other warranties that may arise by law." },
        { caps: "We do not warrant that information provided through the Service will be complete, accurate, reliable, or suitable for your particular purchase decision." },
        "Nothing in these Terms limits rights that cannot lawfully be waived.",
      ],
    },
    {
      heading: "13. Limitation of Liability",
      blocks: [
        { caps: "To the maximum extent permitted by law, ELEVENELEVEN and its officers, directors, employees, agents, and affiliates will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages arising from or related to your use of the Service." },
        { caps: "To the maximum extent permitted by law, ELEVENELEVEN's total liability for claims arising out of or relating to the Service or these Terms will not exceed the greater of (a) the amount you paid ELEVENELEVEN during the 12 months before the event giving rise to the claim or (b) $100." },
        "Some jurisdictions do not allow certain limitations of liability, so portions of this provision may not apply to you.",
      ],
    },
    {
      heading: "14. Termination",
      blocks: [
        "You may stop using ELEVENELEVEN at any time.",
        "We may suspend or terminate access to the Service if you violate these Terms, create risk or legal exposure for ELEVENELEVEN or others, or if suspension is reasonably necessary to protect the Service or community.",
        "Provisions that by their nature should survive termination will remain in effect.",
      ],
    },
    {
      heading: "15. Changes to These Terms",
      blocks: [
        "We may update these Terms as the Service evolves.",
        "If we make material changes, we will provide reasonable notice. Your continued use of the Service after updated Terms become effective constitutes acceptance of the revised Terms where permitted by law.",
      ],
    },
    {
      heading: "16. Governing Law",
      blocks: [
        "These Terms are governed by the laws of the State of Delaware, without regard to conflict-of-law principles.",
      ],
    },
    {
      heading: "17. Contact",
      blocks: [
        "Questions about these Terms may be sent to:",
        `ELEVENELEVEN, Inc.\n${LEGAL_EMAIL}`,
      ],
    },
  ],
};

function BlockView({ b, isMobile }: { b: Block; isMobile: boolean }) {
  const text = body(isMobile ? 15 : 16, C.inkSoft);
  if (typeof b === "string") return <p style={{ ...text, whiteSpace: "pre-line" }}>{b}</p>;
  if ("list" in b) {
    return (
      <ul style={{ ...text, margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
        {b.list.map((li) => <li key={li}>{li}</li>)}
      </ul>
    );
  }
  if ("lead" in b) return <p style={text}><span style={strong(isMobile ? 15 : 16)}>{b.lead}</span> {b.text}</p>;
  return <p style={{ ...text, textTransform: "uppercase", fontSize: isMobile ? 13 : 14, letterSpacing: "0.02em" }}>{b.caps}</p>;
}

function LegalPage({ doc, other }: { doc: Doc; other: { to: string; label: string } }) {
  const { isMobile } = useViewport();
  return (
    // Same scroll setup as the profile: the page scrolls inside this, not the
    // document, so iOS doesn't leave blank tiles under the fixed header.
    <div className="fixed inset-0 overflow-hidden flex justify-center" style={{ background: C.paper, color: C.ink }}>
      <div className="w-full max-w-[1320px] no-scrollbar" style={{ overflowY: "scroll", overscrollBehavior: "contain" }}>
        <ProfileHeader isMobile={isMobile} right={null} />
        <main style={wrap(isMobile)}>
          <article style={{ maxWidth: 720, margin: "0 auto", paddingTop: isMobile ? 28 : 56 }}>
            <h1 style={display(isMobile ? 44 : 72)}>{doc.title}</h1>
            <p style={{ ...meta(11, C.muted), marginTop: isMobile ? 14 : 18 }}>Effective {EFFECTIVE_DATE}</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: isMobile ? 26 : 36 }}>
              {doc.intro.map((b, i) => <BlockView key={i} b={b} isMobile={isMobile} />)}
            </div>

            {doc.sections.map((s) => (
              <section key={s.heading} style={{ borderTop: `1px solid ${C.rule}`, marginTop: isMobile ? 30 : 40, paddingTop: isMobile ? 20 : 26 }}>
                <h2 style={{ ...meta(isMobile ? 11.5 : 12.5, C.ink), fontWeight: 700 }}>{s.heading}</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
                  {s.blocks.map((b, i) => <BlockView key={i} b={b} isMobile={isMobile} />)}
                </div>
              </section>
            ))}

            <p style={{ marginTop: isMobile ? 36 : 48 }}>
              <Link to={other.to} style={{ ...meta(11, C.burgundy), fontWeight: 700, textDecoration: "none" }}>{other.label} →</Link>
            </p>
          </article>
          <ProfileFooter isMobile={isMobile} />
        </main>
      </div>
    </div>
  );
}

export function PrivacyPage() {
  return <LegalPage doc={PRIVACY} other={{ to: "/terms", label: "Terms of Use" }} />;
}

export function TermsPage() {
  return <LegalPage doc={TERMS} other={{ to: "/privacy", label: "Privacy Policy" }} />;
}

/** "By continuing, you agree to our Terms and Privacy Policy." Opens in a new tab so a half-filled form survives. */
export function AgreeLine({ action = "continuing", style }: { action?: string; style?: React.CSSProperties }) {
  const link: React.CSSProperties = { color: "inherit", textDecoration: "underline", textUnderlineOffset: 3, textDecorationThickness: 1 };
  return (
    <p style={{ ...body(12.5, C.muted), ...style }}>
      By {action}, you agree to our{" "}
      <a href="/terms" target="_blank" rel="noopener noreferrer" style={link}>Terms</a> and{" "}
      <a href="/privacy" target="_blank" rel="noopener noreferrer" style={link}>Privacy Policy</a>, and confirm you're 18 or older.
    </p>
  );
}
