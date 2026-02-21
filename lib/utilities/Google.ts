import { Env } from "@env/env";
import { Google } from "arctic";

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = Env.env;
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Google Client ID or Secret not set in environment variables");
}

export const google = new Google(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    "http://localhost:4321/oauth2callback" // Change this to your actual redirect URI
);
