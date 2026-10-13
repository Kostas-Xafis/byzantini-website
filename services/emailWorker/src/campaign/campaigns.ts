import { EVENT_ANNOUNCEMENT_FILENAME, EVENT_ANNOUNCEMENT_URL, POSTER_FILENAME, POSTER_URL } from "../../render/assets";
import { urlAttachment } from "./attachments";
import {
	getLastThreeYearsStudentRecipients,
	getRecentStudentsRecipients,
	getRenewalRecipients,
	getReturningStudentsRecipients,
	getTeacherRecipients,
} from "./queries";
import type { CampaignConfig } from "./types";

/**
 * Campaign registry. Each entry is a self-contained campaign definition —
 * add new ones here instead of writing one-off scripts.
 */
export const campaigns: Record<string, CampaignConfig> = {
	"renew-2026": {
		id: "renew-2026",
		title: "Υπενθύμιση Εγγραφών 2026-27 (σπουδαστές 2025-26)",
		subject: "Έναρξη Εγγραφών - Μαθημάτων 2026-27",
		htmlTemplateName: "2026/upenthimisi_eggrafis.html",
		// SMS twin of the reminder, compiled to plain text from
		// render/sms/RenewalSms.tsx by `bun run templates:build`. Greek text is
		// UCS-2, so a segment holds 67 characters — the 3-segment budget is a hard
		// cost ceiling as well as a readability one.
		sms: {
			templateName: "2026/upenthimisi_eggrafis.sms.txt",
			category: "marketing",
			maxSegments: 3,
		},
		getRecipients: (db) => getRenewalRecipients("2025-2026", "2026-2027", db),
		// The poster is embedded in the template AND attached, like the 2025 campaign.
		getAttachments: async () => [await urlAttachment(POSTER_URL, POSTER_FILENAME)],
		paceMs: 800,
		dailyCap: 900,
	},
	"renew-2026-fix": {
		id: "renew-2026-fix",
		title: "Υπενθύμιση Εγγραφών 2026-27 (σπουδαστές 2025-26)",
		subject: "ΔΙΌΡΘΩΣΗ - Έναρξη Εγγραφών - Μαθημάτων 2026-27",
		htmlTemplateName: "2026/upenthimisi_eggrafis.html",
		sms: {
			templateName: "2026/upenthimisi_eggrafis.sms.txt",
			category: "marketing",
			maxSegments: 3,
		},
		getRecipients: (db) => getRenewalRecipients("2025-2026", "2026-2027", db),
		// The poster is embedded in the template AND attached, like the 2025 campaign.
		getAttachments: async () => [await urlAttachment(POSTER_URL, POSTER_FILENAME)],
		paceMs: 800,
		dailyCap: 900,
	},
	"return-2026": {
		id: "return-2026",
		title: "🎼 «Η μουσική μάς ενώνει ξανά» Νέα σχολική χρονιά - εγγραφές",
		subject: "🎼 «Η μουσική μάς ενώνει ξανά» Νέα σχολική χρονιά - εγγραφές.",
		htmlTemplateName: "2026/epistrofi_mathiton.html",
		plainTextTemplateName: "2026/epistrofi_mathiton.txt",
		// Deliberately no sms block: this list is the legacy email_subscriptions
		// table, which holds addresses only — there is no number to text. The CLI
		// refuses `--sms` for this campaign up front, before it queries D1, rather
		// than reporting zero reachable recipients.
		// Full emailing list minus 2024+ student signups and teacher emails.
		getRecipients: (db) => getReturningStudentsRecipients(db),
		// Same poster as the renewal campaign: embedded in the template AND attached.
		getAttachments: async () => [await urlAttachment(POSTER_URL, POSTER_FILENAME)],
		paceMs: 800,
		dailyCap: 900,
	},
	"google-review-2026": {
		id: "google-review-2026",
		title: "⭐ Αξιολόγηση στους Χάρτες Google (σπουδαστές 2025-2027)",
		subject: "Μια μικρή χάρη: η γνώμη σας στους Χάρτες Google ⭐",
		htmlTemplateName: "2026/google_review.html",
		plainTextTemplateName: "2026/google_review.txt",
		// SMS twin, compiled from render/sms/GoogleReviewSms.tsx. Shorter than the
		// renewal SMS (2 segments) because the review URL alone is 39 characters.
		sms: {
			templateName: "2026/google_review.sms.txt",
			category: "marketing",
			maxSegments: 3,
		},
		// Recent students (registrations 2025-today), excluding teachers and admins.
		getRecipients: (db) => getRecentStudentsRecipients(db),
		// Light one-ask email — no poster attachment.
		paceMs: 800,
		dailyCap: 900,
	},
	"teachers-eggrafes-2026": {
		id: "teachers-eggrafes-2026",
		title: "Υπενθύμιση εγγραφών 2026-27 (προς καθηγητές)",
		subject: "Υπενθύμιση εγγραφών 2026-27 — ενημερώστε τους σπουδαστές σας",
		htmlTemplateName: "2026/upenthimisi_eggrafis_kathigites.html",
		plainTextTemplateName: "2026/upenthimisi_eggrafis_kathigites.txt",
		// SMS twin, compiled from render/sms/TeachersSms.tsx. Category "service",
		// not "marketing": teachers are staff receiving an operational reminder,
		// so the message carries no STOP opt-out instruction.
		sms: {
			templateName: "2026/upenthimisi_eggrafis_kathigites.sms.txt",
			category: "service",
			maxSegments: 3,
		},
		// Active teachers (visible on the website) with an email address.
		getRecipients: (db) => getTeacherRecipients(db),
		// Poster embedded in the template AND attached, like the other 2026 campaigns.
		getAttachments: async () => [await urlAttachment(POSTER_URL, POSTER_FILENAME)],
		paceMs: 800,
		dailyCap: 900,
	},
	"agiasmos-aponomi-2026": {
		id: "agiasmos-aponomi-2026",
		title: "Πρόσκληση Εκδήλωσης – Αγιασμός & Απονομή Πτυχίων (σπουδαστές 2024-today)",
		subject: "Πρόσκληση Εκδήλωσης – Αγιασμός & Απονομή Πτυχίων",
		htmlTemplateName: "2026/agiasmos_aponomi.html",
		plainTextTemplateName: "2026/agiasmos_aponomi.txt",
		// Deliberately no sms block: this is an email-only invitation. It carries a
		// PDF to open, and its copy is many times an SMS budget.
		// Everyone registered in the last three school years (2024-today).
		getRecipients: (db) => getLastThreeYearsStudentRecipients(db),
		// The ανακοίνωση PDF lives in the site's R2 bucket; a PDF cannot be embedded
		// inline the way the poster image is, so it goes out as an attachment.
		getAttachments: async () => [await urlAttachment(EVENT_ANNOUNCEMENT_URL, EVENT_ANNOUNCEMENT_FILENAME)],
		paceMs: 800,
		dailyCap: 900,
	},
	"agiasmos-aponomi-kathigites-2026": {
		id: "agiasmos-aponomi-kathigites-2026",
		title: "Πρόσκληση Εκδήλωσης – Αγιασμός & Απονομή Πτυχίων (προς καθηγητές)",
		subject: "Πρόσκληση Εκδήλωσης – Αγιασμός & Απονομή Πτυχίων: ενημερώστε τους μαθητές σας",
		htmlTemplateName: "2026/agiasmos_aponomi_kathigites.html",
		plainTextTemplateName: "2026/agiasmos_aponomi_kathigites.txt",
		// No sms block, like the student invitation: the ask is a PDF and a roomful
		// of students to brief, which does not compress into 67-character segments.
		// Active teachers (visible on the website) with an email address.
		getRecipients: (db) => getTeacherRecipients(db),
		// The same ανακοίνωση PDF the student invitation attaches, from the site's R2.
		getAttachments: async () => [await urlAttachment(EVENT_ANNOUNCEMENT_URL, EVENT_ANNOUNCEMENT_FILENAME)],
		paceMs: 800,
		dailyCap: 900,
	},
};
