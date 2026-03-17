export const TOKEN_KEY = "brewai_token";
export const REFRESH_KEY = "brewai_refresh";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function getUserEmail(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    // Prefer email field; fall back to sub only if it looks like an email
    if (payload.email) return payload.email;
    if (payload.sub && payload.sub.includes("@")) return payload.sub;
    return null;
  } catch {
    return null;
  }
}
