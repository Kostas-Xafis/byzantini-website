import { SCHOOL_CONTACT, siteHref } from "./schoolContact";

/**
 * Shared campaign assets (used both for the inline email image and for
 * attachments). URLs must be absolute and percent-encoded — email clients
 * fetch images from the web and MailerSend downloads attachments.
 */
export const POSTER_URL =
	siteHref(SCHOOL_CONTACT.paths.files) + "/" + encodeURIComponent("Ανακοίνωση Έναρξης Μαθηματων 2026.jpg");

export const POSTER_FILENAME = "Ανακοίνωση Έναρξης Μαθημάτων 2026.jpg";

/**
 * Ανακοίνωση of the 2026 Αγιασμός & Απονομή Πτυχίων event. The PDF lives in the
 * site's R2 bucket (`byzantini-bucket`) under `emails/files/`, so the very URL
 * the site serves is what MailerSend downloads for the attachment — there is no
 * local copy to keep in sync.
 */
export const EVENT_ANNOUNCEMENT_FILENAME =
	"ΑΝΑΚΟΙΝΩΣΗ ΜΟΥΣΙΚΟΧΟΡΕΥΤΙΚΗ ΕΚΔΗΛΩΣΗ Σχολής Βυζαντινής Μουσικής.pdf";

export const EVENT_ANNOUNCEMENT_URL =
	siteHref(SCHOOL_CONTACT.paths.files) + "/" + encodeURIComponent(EVENT_ANNOUNCEMENT_FILENAME);

/**
 * Poster (JPG) of the same event, also in the site's R2 bucket. It is embedded
 * inline — `CenteredImage` renders it wrapped in a link and adds the
 * "Δείτε την ανακοίνωση σε πλήρη ανάλυση" link beneath, so recipients whose
 * client blocks remote images can still open it.
 */
export const EVENT_IMAGE_FILENAME = "Ανακοίνωση εκδήλωσης-αγιασμού-απονομής πτυχίων.jpg";

export const EVENT_IMAGE_URL =
	siteHref(SCHOOL_CONTACT.paths.files) + "/" + encodeURIComponent(EVENT_IMAGE_FILENAME);
