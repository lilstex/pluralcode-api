import { OrgBadgeLevel } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// ORG BADGE LEVEL — static display metadata (titles, descriptions, images)
//
// Single source of truth for the titles, public popup descriptions, dashboard
// messaging, disclaimer and badge IMAGES. Used when fetching organizations
// (public page + NGO dashboard) and by the public GET /ngo-badges/levels/metadata
// endpoint, so the frontend never hardcodes this.
//
// IMAGES: the three levels are static, so the images are too. Upload the three
// artwork files once (e.g. to Azure blob storage, like the normal Badge model),
// then set these env vars to the resulting URLs:
//     ORG_BADGE_LEVEL_1_IMAGE_URL
//     ORG_BADGE_LEVEL_2_IMAGE_URL
//     ORG_BADGE_LEVEL_3_IMAGE_URL
// If an env var is unset, imageUrl is null and the frontend can fall back to a
// bundled asset / placeholder.
//
// The `description` and `disclaimer` text is verbatim from the product spec.
// The `dashboardMessage` copy is editable.
// ─────────────────────────────────────────────────────────────────────────────

export const ORG_BADGE_DISCLAIMER =
  "The PLRCAP NGO Support Hub verification badges are based on an organization's engagement with PLRCAP programs and available documentation. While these badges provide useful guidance, they do not constitute a full accreditation or certification. Users are solely responsible for independently verifying information and conducting due diligence before forming partnerships or making funding decisions. The Hub is not liable for actions or representations made by organizations beyond the scope of its verification process.";

interface BadgeLevelMeta {
  title: string;
  description: string; // public popup text
  dashboardMessage: string; // "why you have this" + encouragement
}

export const ORG_BADGE_LEVEL_META: Record<OrgBadgeLevel, BadgeLevelMeta> = {
  LEVEL_1: {
    title: 'PLRCAP Registered Active Member',
    description:
      'This entry-level badge is awarded to organizations that have demonstrated ongoing interest and involvement in NGO capacity development.',
    dashboardMessage:
      "You've earned the Registered Active Member badge for your ongoing engagement with the platform. Keep completing resources, joining the community and attending events — and complete an ODA assessment with a fully completed profile — to qualify for the next level.",
  },
  LEVEL_2: {
    title: 'PLRCAP Programme Graduate',
    description:
      'This badge indicates a deeper level of engagement and commitment to institutional strengthening.',
    dashboardMessage:
      "You've reached Programme Graduate, reflecting a deeper commitment to institutional strengthening. Your organization is now eligible for on-site verification toward the highest Gold Verified level.",
  },
  LEVEL_3: {
    title: 'PLRCAP Gold Verified Organisation',
    description:
      'This highest-level badge reflects a strong track record of credibility, operational maturity, and impact.',
    dashboardMessage:
      'Your organization is Gold Verified — the highest level, reflecting a strong track record of credibility, operational maturity and impact.',
  },
};

const LEVEL_ORDER: OrgBadgeLevel[] = [
  OrgBadgeLevel.LEVEL_1,
  OrgBadgeLevel.LEVEL_2,
  OrgBadgeLevel.LEVEL_3,
];

/** All tiers implied by the current level. LEVEL_2 → ['LEVEL_1','LEVEL_2']. No badge → []. */
export function earnedLevelsUpTo(
  level: OrgBadgeLevel | null | undefined,
): OrgBadgeLevel[] {
  if (!level) return [];
  const idx = LEVEL_ORDER.indexOf(level);
  return LEVEL_ORDER.slice(0, idx + 1);
}

// Env var holding each level's image URL. Resolved at call time (not module
// load) to avoid env load-order issues.
const LEVEL_IMAGE_ENV: Record<OrgBadgeLevel, string> = {
  LEVEL_1: 'ORG_BADGE_LEVEL_1_IMAGE_URL',
  LEVEL_2: 'ORG_BADGE_LEVEL_2_IMAGE_URL',
  LEVEL_3: 'ORG_BADGE_LEVEL_3_IMAGE_URL',
};

export function resolveBadgeImageUrl(level: OrgBadgeLevel): string | null {
  return (
    process.env[LEVEL_IMAGE_ENV[level]] ??
    'https://plrcapstorage.blob.core.windows.net/avatars/d2326795-6a16-4484-ac34-c90793bcc263.png'
  );
}

const BLANK_BADGE_MESSAGE =
  'Your organization has no verification badge yet. Use the platform more — complete resources, engage with the community, register for events and finish your profile and an ODA assessment — to work toward your first badge level.';

export interface OrgBadgeView {
  level: OrgBadgeLevel | null;
  hasBadge: boolean;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  dashboardMessage: string;
  disclaimer: string;
}

/**
 * Build the badge view object attached to organization responses.
 * Returns a "blank badge" shape (imageUrl null) when the org has no level yet.
 */
export function buildOrgBadgeView(
  level: OrgBadgeLevel | null | undefined,
): OrgBadgeView {
  if (!level) {
    return {
      level: null,
      hasBadge: false,
      title: null,
      description: null,
      imageUrl: null,
      dashboardMessage: BLANK_BADGE_MESSAGE,
      disclaimer: ORG_BADGE_DISCLAIMER,
    };
  }

  const meta = ORG_BADGE_LEVEL_META[level];
  return {
    level,
    hasBadge: true,
    title: meta.title,
    description: meta.description,
    imageUrl: resolveBadgeImageUrl(level),
    dashboardMessage: meta.dashboardMessage,
    disclaimer: ORG_BADGE_DISCLAIMER,
  };
}

/**
 * Static metadata for all three levels — for the public
 * GET /ngo-badges/levels/metadata endpoint (badge popup / legend).
 */
export function listBadgeLevelMetadata() {
  return {
    disclaimer: ORG_BADGE_DISCLAIMER,
    levels: (Object.keys(ORG_BADGE_LEVEL_META) as OrgBadgeLevel[]).map(
      (level) => ({
        level,
        title: ORG_BADGE_LEVEL_META[level].title,
        description: ORG_BADGE_LEVEL_META[level].description,
        imageUrl: resolveBadgeImageUrl(level),
      }),
    ),
  };
}
