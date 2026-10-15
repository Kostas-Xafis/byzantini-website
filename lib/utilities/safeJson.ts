/**
 * JSON for an inline `<script>` element (JSON-LD, page data). `JSON.stringify` leaves `<` alone, so a value
 * containing `</script>` (an announcement title, a location name) would close the element and run whatever
 * follows as HTML. Escaping `<`, `>` and `&` as `<`… keeps the text valid JSON with the same value;
 * U+2028/U+2029 are escaped too, for older JavaScript parsers.
 */
export function jsonForScript(value: unknown): string {
	return JSON.stringify(value)
		.replace(/</g, "\\u003c")
		.replace(/>/g, "\\u003e")
		.replace(/&/g, "\\u0026")
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029");
}
