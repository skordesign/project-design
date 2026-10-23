import { env } from "@/server/env";
import type { GithubProfile } from "@/server/auth/sessions";

export const OAUTH_STATE_COOKIE = "pd_oauth_state";
export const CALLBACK_PATH = "/api/auth/github/callback";

/** Without GitHub credentials the app runs in local mode: no sign-in, one built-in user. */
export const isLocalMode = () => !githubConfigured();

export function githubConfigured(): boolean {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = env();
  return Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);
}

export function authorizeUrl(state: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env().GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", new URL(CALLBACK_PATH, env().APP_URL).toString());
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "true");
  return url.toString();
}

/** Exchanges the callback's code for the user's GitHub profile. Throws on any failure. */
export async function fetchGithubProfile(code: string): Promise<GithubProfile> {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, APP_URL } = env();
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: new URL(CALLBACK_PATH, APP_URL).toString(),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const token = (await tokenResponse.json()) as { access_token?: string; error?: string };
  if (!token.access_token) throw new Error(`GitHub token exchange failed: ${token.error}`);

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token.access_token}`,
      "User-Agent": "project-designer",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!userResponse.ok) throw new Error(`GitHub /user returned ${userResponse.status}`);
  const profile = (await userResponse.json()) as GithubProfile;
  if (!profile.id || !profile.login) throw new Error("GitHub /user returned no id/login");
  return profile;
}

/** Whether a GitHub login may sign in (GITHUB_ALLOWED_USERS; empty allows everyone). */
export function isAllowedLogin(login: string): boolean {
  const allowed = env().GITHUB_ALLOWED_USERS;
  return allowed.length === 0 || allowed.includes(login.toLowerCase());
}

/** Keeps post-login redirects on this site: a path, never `//host` or a full URL. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/projects";
  }
  return value;
}
