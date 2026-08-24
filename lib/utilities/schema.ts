// SEO helpers: school identity constants and JSON-LD schema builders.
// The business data below mirrors the live school data (location 1, contact
// modal, socials) and the site's production URL.

export const SCHOOL = {
	name: "Σχολή Βυζαντινής & Παραδοσιακής Μουσικής",
	fullName: "Σχολή Βυζαντινής & Παραδοσιακής Μουσικής Ι.Ν. Μεταμορφώσεως του Σωτήρος",
	url: "https://musicschool-metamorfosi.gr",
	telephone: ["+30 6983380631", "+30 6975848638", "+30 6948751656"],
	email: "music@inmm.gr",
	address: {
		streetAddress: "Χλόης & Οδυσσέως",
		postalCode: "14452",
		addressLocality: "Μεταμόρφωση",
		addressRegion: "Αττική",
		addressCountry: "GR",
	},
	geo: {
		latitude: 38.0643227,
		longitude: 23.7602996,
	},
	sameAs: [
		"https://www.facebook.com/profile.php?id=100032307446762",
		"https://www.youtube.com/@user-sx5os9rc1k",
		"https://inmm.gr/",
	],
} as const;

// Unique identifier of the school entity, referenced by other schemas.
export const SCHOOL_ID = `${SCHOOL.url}/#school`;

export const organizationSchema = () => {
	return {
		"@context": "https://schema.org",
		"@type": "EducationalOrganization",
		"@id": SCHOOL_ID,
		name: SCHOOL.fullName,
		alternateName: SCHOOL.name,
		url: SCHOOL.url,
		logo: `${SCHOOL.url}/logo.png`,
		image: `${SCHOOL.url}/og-image.jpg`,
		telephone: [...SCHOOL.telephone],
		email: SCHOOL.email,
		address: { "@type": "PostalAddress", ...SCHOOL.address },
		geo: { "@type": "GeoCoordinates", ...SCHOOL.geo },
		sameAs: [...SCHOOL.sameAs],
		openingHoursSpecification: [
			{
				"@type": "OpeningHoursSpecification",
				dayOfWeek: [
					"Monday",
					"Tuesday",
					"Wednesday",
					"Thursday",
					"Friday",
					"Saturday",
					"Sunday",
				],
				opens: "09:00",
				closes: "14:00",
			},
			{
				"@type": "OpeningHoursSpecification",
				dayOfWeek: [
					"Monday",
					"Tuesday",
					"Wednesday",
					"Thursday",
					"Friday",
					"Saturday",
					"Sunday",
				],
				opens: "16:30",
				closes: "21:00",
			},
		],
		hasOfferCatalog: {
			"@type": "OfferCatalog",
			name: "Μουσικά τμήματα",
			itemListElement: [
				{
					"@type": "Offer",
					category: "Βυζαντινή Μουσική",
					itemOffered: {
						"@type": "Course",
						name: "Βυζαντινή Μουσική",
						description:
							"Θεωρία και πράξη, λειτουργικό και τυπικό, υμνολογία, ιστορία βυζαντινής μουσικής, χορωδιακά μαθήματα και ιερατικές εκφωνήσεις.",
						inLanguage: "el",
						provider: { "@id": SCHOOL_ID },
					},
				},
				{
					"@type": "Offer",
					category: "Παραδοσιακή Μουσική",
					itemOffered: {
						"@type": "Course",
						name: "Παραδοσιακό τραγούδι και μουσικά όργανα",
						description:
							"Κανονάκι, σαντούρι, ούτι, ταμπουράς, κλαρίνο, βιολί, ποντιακή λύρα, κρητικό λαούτο, ορχήστρα παραδοσιακών οργάνων και χορωδία παραδοσιακού τραγουδιού.",
						inLanguage: "el",
						provider: { "@id": SCHOOL_ID },
					},
				},
				{
					"@type": "Offer",
					category: "Ευρωπαϊκή Μουσική",
					itemOffered: {
						"@type": "Course",
						name: "Ευρωπαϊκή Μουσική",
						description:
							"Πιάνο, αρμόνιο, σαξόφωνο, φλάουτο, κλαρινέτο, φλογέρα, τρομπέτα, σολφέζ και αρμονία, φωνητική - ορθοφωνία και θεωρία ευρωπαϊκής μουσικής.",
						inLanguage: "el",
						provider: { "@id": SCHOOL_ID },
					},
				},
			],
		},
	};
};

export const breadcrumbsSchema = (items: { name: string; url: string }[]) => {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: `${SCHOOL.url}${item.url}`,
		})),
	};
};
