import { SCHOOL_CONTACT, siteHref } from "./schoolContact";

/**
 * Shared campaign assets (used both for the inline email image and for
 * attachments). URLs must be absolute and percent-encoded — email clients
 * fetch images from the web and MailerSend downloads attachments.
 */
export const POSTER_URL = siteHref(SCHOOL_CONTACT.paths.files) + "/" + encodeURIComponent("Ανακοίνωση Έναρξης Μαθηματων 2026.jpg");

export const POSTER_FILENAME = "Ανακοίνωση Έναρξης Μαθημάτων 2026.jpg";

/**
 * Ανακοίνωση of the 2026 Αγιασμός & Απονομή Πτυχίων event. The PDF lives in the
 * site's R2 bucket (`byzantini-bucket`) under `emails/files/`, so the very URL
 * the site serves is what MailerSend downloads for the attachment — there is no
 * local copy to keep in sync.
 */
export const EVENT_ANNOUNCEMENT_FILENAME = "ΑΝΑΚΟΙΝΩΣΗ ΜΟΥΣΙΚΟΧΟΡΕΥΤΙΚΗ ΕΚΔΗΛΩΣΗ Σχολής Βυζαντινής Μουσικής.pdf";

export const EVENT_ANNOUNCEMENT_URL = siteHref(SCHOOL_CONTACT.paths.files) + "/" + encodeURIComponent(EVENT_ANNOUNCEMENT_FILENAME);

/**
 * Poster (JPG) of the same event, also in the site's R2 bucket. It is embedded
 * inline — `CenteredImage` renders it wrapped in a link and adds the
 * "Δείτε την ανακοίνωση σε πλήρη ανάλυση" link beneath, so recipients whose
 * client blocks remote images can still open it.
 */
export const EVENT_IMAGE_FILENAME = "Ανακοίνωση εκδήλωσης-αγιασμού-απονομής πτυχίων.jpg";

export const EVENT_IMAGE_URL = siteHref(SCHOOL_CONTACT.paths.files) + "/" + encodeURIComponent(EVENT_IMAGE_FILENAME);

/**
 * Σεμινάριο Βυζαντινής Μουσικής, Τετάρτη 2 Δεκεμβρίου 2026. The poster is the main photo of the announcement
 * (id 49) the secretaries uploaded, so the email shows the very file the site serves — no second copy in R2.
 */
export const SEMINAR_POSTER_URL = siteHref("/anakoinoseis/images/49/seminario_vuz_mous-mwxfic9e.jpg");

export const SEMINAR_POSTER_FILENAME = "Σεμινάριο Βυζαντινής Μουσικής - 2 Δεκεμβρίου 2026.jpg";

/** The announcement page (its URL is the title with spaces, ending in a slash). */
export const SEMINAR_ANNOUNCEMENT_URL = siteHref("/sxoli/anakoinoseis/" + encodeURIComponent("Σεμινάριο βυζαντινής μουσικής") + "/");
