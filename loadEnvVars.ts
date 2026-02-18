import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const CLIENT_EXPOSED_PREFIXES = ["VITE_", "PUBLIC_"] as const;

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

export function loadEnvVars(env: string): Record<string, string> {
    const filePath = resolve(process.cwd(), `.dev.vars.${env}`);

    if (!existsSync(filePath)) {
        console.warn(`[loadEnvVars] Env file not found: ${filePath}`);
        return {};
    }

    const fileContents = readFileSync(filePath, "utf8");
    const parsed = parseEnvFile(fileContents);
    const isProduction = env === "production";

    const filteredEntries = Object.entries(parsed).filter(([key]) => {
        if (!isProduction) return true;
        return CLIENT_EXPOSED_PREFIXES.some((prefix) => key.startsWith(prefix));
    });

    const envVars = Object.fromEntries(
        filteredEntries.map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])
    );
    return envVars;
}
