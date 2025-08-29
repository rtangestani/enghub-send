// frontend/lib/auth.js
export function setAuth(token, user) {
  if (typeof window === "undefined") return;
  localStorage.setItem("enghub:token", token);
  localStorage.setItem("enghub:user", JSON.stringify(user));
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("enghub:token");
}

export function getUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("enghub:user");
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function authHeader() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("enghub:token");
  localStorage.removeItem("enghub:user");
}
