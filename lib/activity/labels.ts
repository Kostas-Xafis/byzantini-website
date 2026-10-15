/**
 * What the activity log records (client-safe: the «Ιστορικό ενεργειών» page uses the same table).
 *
 * Only the endpoints listed here are recorded — real changes made by a signed-in admin. Reads that travel
 * as POST (`getById`, `search`, `previewFees`, `PDF.generate`, …), sign-ins and the public forms are not.
 * To log a new route, add its endpoint key with a short Greek description.
 */
export const ACTIVITY_LABELS: Record<string, string> = {
	"Pupils.post": "Νέα εγγραφή μαθητή",
	"Pupils.update": "Επεξεργασία στοιχείων μαθητή",
	"Pupils.enroll": "Προσθήκη εγγραφής σε μαθητή",
	"Pupils.updateEnrollment": "Επεξεργασία εγγραφής",
	"Pupils.deleteEnrollments": "Διαγραφή εγγραφών",
	"Pupils.settleYear": "Εξόφληση διδάκτρων έτους",

	"Payments.post": "Νέα οφειλή μαθητή",
	"Payments.updatePayment": "Ενημέρωση οφειλής μαθητή",
	"Payments.complete": "Εξόφληση οφειλής μαθητή",
	"Payments.delete": "Διαγραφή οφειλών μαθητών",
	"Payoffs.updateAmount": "Ενημέρωση οφειλής σχολής",
	"Payoffs.complete": "Εξόφληση οφειλής σχολής",

	"Books.post": "Νέο βιβλίο",
	"Books.updateQuantity": "Ενημέρωση αποθέματος βιβλίου",
	"Books.delete": "Διαγραφή βιβλίων",
	"Wholesalers.post": "Νέος χονδρέμπορος",
	"Wholesalers.delete": "Διαγραφή χονδρεμπόρων",

	"Teachers.post": "Νέος καθηγητής",
	"Teachers.update": "Επεξεργασία καθηγητή",
	"Teachers.fileUpload": "Ανέβασμα αρχείου καθηγητή",
	"Teachers.fileRename": "Μετονομασία αρχείου καθηγητή",
	"Teachers.fileDelete": "Διαγραφή αρχείου καθηγητή",
	"Teachers.delete": "Διαγραφή καθηγητών",
	"Instruments.post": "Νέο όργανο",
	"Instruments.delete": "Διαγραφή οργάνων",

	"Locations.post": "Νέο παράρτημα",
	"Locations.update": "Επεξεργασία παραρτήματος",
	"Locations.fileUpload": "Ανέβασμα εικόνας παραρτήματος",
	"Locations.fileDelete": "Διαγραφή εικόνας παραρτήματος",
	"Locations.delete": "Διαγραφή παραρτημάτων",

	"Announcements.post": "Νέα ανακοίνωση",
	"Announcements.update": "Επεξεργασία ανακοίνωσης",
	"Announcements.delete": "Διαγραφή ανακοινώσεων",
	"Announcements.postImage": "Ανέβασμα εικόνας ανακοίνωσης",
	"Announcements.imagesDelete": "Διαγραφή εικόνων ανακοίνωσης",

	"FeeCatalog.create": "Νέα έκδοση καταλόγου διδάκτρων",

	"SysUsers.createRegisterLink": "Πρόσκληση νέου διαχειριστή",
	"SysUsers.setRole": "Αλλαγή ρόλου διαχειριστή",
	"SysUsers.delete": "Διαγραφή διαχειριστών",
	"Authentication.changePassword": "Αλλαγή κωδικού",
	"Authentication.unlinkProvider": "Αποσύνδεση λογαριασμού εισόδου",
};

/** The page's category filter: endpoint group → Greek name. */
export const ACTIVITY_GROUPS: Record<string, string> = {
	Pupils: "Μαθητολόγιο",
	Payments: "Οφειλές μαθητών",
	Payoffs: "Οφειλές σχολής",
	Books: "Βιβλία",
	Wholesalers: "Βιβλία",
	Teachers: "Καθηγητές",
	Instruments: "Καθηγητές",
	Locations: "Παραρτήματα",
	Announcements: "Ανακοινώσεις",
	FeeCatalog: "Δίδακτρα",
	SysUsers: "Διαχειριστές",
	Authentication: "Διαχειριστές",
};

/** Endpoint groups behind one category name (e.g. «Βιβλία» → Books, Wholesalers). */
export const groupsOfCategory = (category: string) =>
	Object.entries(ACTIVITY_GROUPS)
		.filter(([, name]) => name === category)
		.map(([group]) => group);
