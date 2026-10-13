/**
 * Single source of truth for every school contact detail referenced by the
 * React Email templates (phones, emails, website URLs, social links).
 *
 * Update a value here and it changes everywhere it is rendered — no more
 * hunting for hardcoded phone numbers across the components. The helpers at
 * the bottom build the mailto:/tel:/site links used by the emails.
 */
export const SCHOOL_CONTACT = {
	name: "Σχολή Βυζαντινής & Παραδοσιακής Μουσικής",
	church: "Ιερού Ναού Μεταμορφώσεως του Σωτήρος",
	address: "Χλόης & Οδυσσέως, 144 52 Μεταμόρφωση",
	website: {
		/** Absolute base URL of the school website (no trailing slash). */
		baseUrl: "https://musicschool-metamorfosi.gr",
		/** Bare hostname, used as the visible link text. */
		host: "musicschool-metamorfosi.gr",
		/** Logo served from the website — absolute URL so email clients can fetch it. */
		logoUrl: "https://musicschool-metamorfosi.gr/logo_small.png",
	},
	emails: {
		/** Γραμματεία — general inquiries (both departments). */
		secretariat: "music@inmm.gr",
		/** Βυζαντινή Μουσική department inbox. */
		byzantine: "byzscholemousikhs@gmail.com",
	},
	phones: {
		/** Γραμματεία (κινητό). */
		secretariat: "6983380631",
		/** Σταθερό γραμματείας. */
		landline: "2102850060",
		/** Τμήμα Παραδοσιακής & Ευρωπαϊκής Μουσικής. */
		traditional: ["6975834887"],
	},
	googleMaps: {
		/**
		 * Direct "write a review" link for the school's Google Maps listing —
		 * the official link from Google Business Profile ("Share review form").
		 * It encodes the listing's CID (0x6ee1659b0c1401e6) and opens Google's
		 * review-solicitation flow. If it ever breaks, regenerate it from the
		 * Business Profile dashboard and update it here.
		 */
		reviewUrl: "https://g.page/r/CeYBFAybZeFuEAE/review",
		/** The school's Google Maps listing — the same link the website uses for directions. */
		placeUrl: "https://maps.app.goo.gl/eYd5Zp7x5nqHrvAf8",
	},
	socials: {
		facebook: "https://www.facebook.com/profile.php?id=100032307446762",
		youtube: "https://www.youtube.com/channel/UCWABWiLCvetNNXu73JMYPNg",
		instagram: "https://www.instagram.com/musicschool_metamorfosis/",
		viber: "https://invite.viber.com/?g2=AQAVDON2RvnPd04sojeeHN0YATAXc52aSsVAYTsbe4QazieKWm5sYFV9PviqB5hq",
	},
	paths: {
		/** On-site registration flow (append ?regid=...). */
		registrations: "/eggrafes",
		/** Unsubscribe endpoint (append ?token=...). */
		unsubscribe: "/unsubscribe",
		/** Static email files hosted on the website (posters etc.). */
		files: "/emails/files",
	},
} as const;

export type SchoolContact = typeof SCHOOL_CONTACT;

/** tel: href for a phone number. */
export function telHref(number: string): string {
	return `tel:${number}`;
}

/** mailto: href for an email address. */
export function mailHref(address: string): string {
	return `mailto:${address}`;
}

/**
 * Absolute URL under the school website. Pass a sub-path starting with "/"
 * (e.g. "/eggrafes?regid=123") or an empty string for the homepage.
 */
export function siteHref(path = ""): string {
	return `${SCHOOL_CONTACT.website.baseUrl}${path}`;
}
