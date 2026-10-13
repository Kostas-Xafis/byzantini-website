import type { DefaultMailData } from "../types/templates";
import { mailService } from "./mailersend";

type ServerMailData = Partial<DefaultMailData> & { authToken: string; };

Bun.serve({
    // Cloud Run passes the port via the PORT env var; fall back to 3000 for local runs.
    port: Number(process.env.PORT) || 3000,
    async fetch(req: Request): Promise<Response> {
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        };

        if (req.method === "OPTIONS") {
            function handleOptions(request: Request) {
                if (request.headers.get("Origin") !== null &&
                    request.headers.get("Access-Control-Request-Method") !== null &&
                    request.headers.get("Access-Control-Request-Headers") !== null) {
                    // Handle CORS pre-flight request.
                    return new Response(null, {
                        headers: corsHeaders
                    });
                } else {
                    // Handle standard OPTIONS request.
                    return new Response(null, {
                        headers: {
                            "Allow": "GET, HEAD, POST, OPTIONS",
                        }
                    });
                }
            }
            return handleOptions(req);
        } else if (req.method === "POST") {
            try {
                const body = await req.json() as ServerMailData;
                if (!("authToken" in body) || body.authToken !== process.env.SERVICE_AUTH_TOKEN) {
                    return new Response("Invalid authentication token", { status: 401 });
                }
                await mailService(body);
                return new Response("Success", {
                    status: 200,
                    headers: corsHeaders,
                });
            } catch (e) {
                return new Response(`Failed request: ${e}`, { status: 400 });
            }
        } else {
            return new Response("Invalid request. This service accepts only POST requests", { status: 400 });
        }
    },
});
