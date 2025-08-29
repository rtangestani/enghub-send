// frontend/pages/profile/index.js
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function ProfileIndex() {
  const router = useRouter();
  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("enghub:user") : null;
    if (raw) {
      const u = JSON.parse(raw);
      router.replace(`/profile/${u.username}`);
    } else {
      router.replace("/login");
    }
  }, [router]);
  return null;
}
