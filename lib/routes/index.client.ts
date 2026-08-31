/**
 * Client-facing compatibility re-export — Phase 4.
 *
 * The route registry moved to `lib/api/routes` (Isokratis-style APIServer
 * instances). Components import `API`/`APIEndpoints` + types from here, exactly
 * as before; keep this file as the stable import path.
 */
export * from "@lib/api/routes";
