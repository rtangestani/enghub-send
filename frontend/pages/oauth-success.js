// stores token from #token=... then fetches /api/me
import { useEffect } from "react";
import { useRouter } from "next/router";
import { setAuth } from "../lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

export default function OAuthSuccess(){
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    const m = hash.match(/[#&]token=([^&]+)/);
    const token = m ? decodeURIComponent(m[1]) : null;

    async function finish() {
      if (!token) { router.replace("/login?oauth=failed"); return; }
      try {
        const me = await fetch(`${API_BASE}/api/me`, {
          headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.json());
        if (!me?.username) throw new Error("OAuth failed");
        setAuth(token, me);
        router.replace("/explore");
      } catch {
        router.replace("/login?oauth=failed");
      }
    }
    finish();
  }, [router]);

  return null;
}
