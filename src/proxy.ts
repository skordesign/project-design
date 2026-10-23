import { NextResponse, type NextRequest } from "next/server";

// Mirrors SESSION_COOKIE in src/server/auth/sessions.ts (the proxy stays free of server imports).
const SESSION_COOKIE = "pd_session";
// Pages and APIs that need a signed-in user. The landing page and /api/auth/* stay public.
const SIGNED_IN_ONLY = /^\/(projects|settings|api\/projects)(\/|$)/;

/**
 * Optional HTTP Basic auth for the UI and REST routes (APP_BASIC_AUTH="user:pass"), then an
 * optimistic sign-in check: no session cookie on a signed-in-only path goes to the landing page
 * (or 401 for APIs). Local mode (no GitHub credentials) has no sign-in, so it skips that check. The session itself is verified on the server (src/server/auth/current.ts).
 * /api/mcp authenticates with bearer tokens and /api/health must stay open for
 * the container healthcheck, so the matcher skips both.
 */
export function proxy(request: NextRequest) {
  const denied = checkBasicAuth(request);
  if (denied) return denied;

  const { pathname, search } = request.nextUrl;
  if (
    !localMode() &&
    SIGNED_IN_ONLY.test(pathname) &&
    !request.cookies.get(SESSION_COOKIE)?.value
  ) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Sign in to continue" } },
        { status: 401 },
      );
    }
    const landing = new URL("/", request.url);
    landing.searchParams.set("next", pathname + search);
    return NextResponse.redirect(landing);
  }
  return NextResponse.next();
}

/** Mirrors isLocalMode in src/server/auth/github.ts: no GitHub credentials, no sign-in. */
const localMode = () => !(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

function checkBasicAuth(request: NextRequest): NextResponse | null {
  const expected = process.env.APP_BASIC_AUTH;
  if (!expected) return null;

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded && safeEqual(decodeBase64(encoded), expected)) {
    return null;
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Project Designer", charset="UTF-8"' },
  });
}

function decodeBase64(value: string): string {
  try {
    return atob(value);
  } catch {
    return "";
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  matcher: ["/((?!api/mcp|api/health|_next/static|_next/image|favicon.ico).*)"],
};
