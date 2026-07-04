// Shared API helper.
//
// The backend clears the auth cookie and returns 401 whenever the JWT is
// missing, invalid, or expired (see server/middleware/cookies.js). Every
// authenticated request in the app should go through `apiFetch` so that a
// 401 immediately logs the user out client-side instead of leaving stale
// data/localStorage around and silently failing.

export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class AuthExpiredError extends Error {
  constructor() {
    super("Session expired, please log in again");
    this.name = "AuthExpiredError";
  }
}

/**
 * Wraps fetch() for calls to the Carbon Ledger API.
 * - Always sends cookies (`credentials: "include"`).
 * - If the server responds 401 (no/expired/invalid token), clears the
 *   locally cached user and redirects to /login, then throws so the
 *   calling code's try/catch can stop processing instead of rendering
 *   a half-loaded page with a previous user's stale state still showing.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    ...options,
  });

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("carbon_user");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    throw new AuthExpiredError();
  }

  return res;
}