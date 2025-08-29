// frontend/lib/utils.js
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
export function abs(u) {
  return u && u.startsWith("/uploads") ? `${API_BASE}${u}` : u;
}
