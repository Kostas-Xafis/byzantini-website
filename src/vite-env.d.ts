/// <reference types="vite/client" />
import type { EnvironmentVariables } from "@_types/envVars";

interface ImportMeta {
	readonly env: EnvironmentVariables;
}
