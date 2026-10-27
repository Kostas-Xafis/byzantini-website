/** Display helpers of the file fields (FileInput / MultiFileInput). Plain module, no Solid: unit-tested on its own. */

/** Human hint for an `accept` list: ".pdf" → "PDF", "image/*" → "εικόνα". */
export function acceptHint(accept?: string) {
	if (!accept) return "";
	return accept
		.split(",")
		.map((a) => a.trim())
		.filter(Boolean)
		.map((a) => (a === "image/*" ? "εικόνα" : a.startsWith(".") ? a.slice(1).toUpperCase() : (a.split("/")[1] ?? a).toUpperCase()))
		.join(", ");
}

/** Shortens a long file name around its extension: "Ι. Ναός Αγίας Τριάδος Κηφισιάς.jpeg" → "Ι. Ναός Αγίας…ιάς.jpeg". */
export function shortName(name: string, max = 28) {
	if (name.length <= max) return name;
	const dot = name.lastIndexOf(".");
	const ext = dot > 0 ? name.slice(dot) : "";
	const base = dot > 0 ? name.slice(0, dot) : name;
	const keep = max - ext.length - 1;
	return base.slice(0, Math.ceil(keep * 0.7)) + "…" + base.slice(-Math.floor(keep * 0.3)) + ext;
}
