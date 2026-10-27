import { getEnv } from "@env/env";
import { isProduction } from "@lib/utils.server";

/**
 * The course pages (/mathimata/) and the guides (/odigoi/) are drafts under review by the school
 * (docs/SEO_CONTENT_REVIEW.md). They are served in local dev and on the preview worker, where
 * `scripts/cf.ts deploy:preview` sets `DRAFT_PAGES=1`; in production they answer 404 and nothing links
 * to them. Preview and production deploy the same build, so this must be a runtime check — which is why
 * those pages and every link to them are server-rendered, never prerendered.
 *
 * To publish them: delete this gate (and its uses), after the school has signed off the copy.
 */
export const draftPagesEnabled = () => !isProduction() || getEnv().DRAFT_PAGES === "1";
