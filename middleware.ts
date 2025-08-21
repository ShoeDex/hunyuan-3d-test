import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const username = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  // If credentials are not configured, still require auth prompt
  if (!username || !password) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' },
    });
  }

  const authHeader = req.headers.get("authorization");

  if (authHeader && authHeader.startsWith("Basic ")) {
    try {
      const base64Credentials = authHeader.split(" ")[1] ?? "";
      const decodedCredentials = atob(base64Credentials);
      const [providedUser, providedPass] = decodedCredentials.split(":");

      if (providedUser === username && providedPass === password) {
        return NextResponse.next();
      }
    } catch (_) {
      // Fall through to 401 below on parse errors
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' },
  });
}

// Apply to all paths except Next.js internals and favicon
export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
