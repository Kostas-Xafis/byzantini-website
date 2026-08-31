/**
 * Minimal dotenv-style parser (moved from loadEnvVars.ts, which was retired in
 * the Cloudflare Workers migration — Phase 2).
 *
 * Used by CLI tooling (getData/query.ts) to read wrangler `.dev.vars` files.
 */
export function parseEnvFile(content: string): Record<string, string> {
	const vars: Record<string, string> = {};
	const lines = content.split(/\r?\n/);

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;

		const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
		const equalsIndex = withoutExport.indexOf("=");
		if (equalsIndex <= 0) continue;

		const key = withoutExport.slice(0, equalsIndex).trim();
		if (!key) continue;

		const rawValue = withoutExport.slice(equalsIndex + 1).trim();
		let value = rawValue;

		if (
			(rawValue.startsWith('"') && rawValue.endsWith('"')) ||
			(rawValue.startsWith("'") && rawValue.endsWith("'"))
		) {
			value = rawValue.slice(1, -1);
			if (rawValue.startsWith('"')) {
				value = value
					.replace(/\\n/g, "\n")
					.replace(/\\r/g, "\r")
					.replace(/\\t/g, "\t")
					.replace(/\\\\/g, "\\");
			}
		} else {
			const hashIndex = value.indexOf(" #");
			if (hashIndex !== -1) {
				value = value.slice(0, hashIndex).trim();
			}
		}

		vars[key] = value;
	}

	return vars;
}
