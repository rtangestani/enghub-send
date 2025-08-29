// frontend/components/HeroBar.js
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import styles from "./HeroBar.module.css";

export default function HeroBar({ compact = false, showSearch = true, variant = "hero" }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  useEffect(() => {
    setQ((router.query.q || "").toString());
  }, [router.query.q]);

  function submit(e) {
    e.preventDefault();
    router.push(q ? `/explore?q=${encodeURIComponent(q)}` : "/explore");
  }

  const wrapClass =
    `${styles.wrap} ${compact ? styles.compact : ""} ${variant === "footer" ? styles.footer : ""}`;

  return (
  // Limit width to the same max as the navbar
  <div className="container">
    <div className={`${styles.wrap} ${compact ? styles.compact : ""} ${variant === "footer" ? styles.footer : ""}`}>
      {showSearch && (
        <form onSubmit={submit} className={styles.search}>
          <div className={styles.icon}>
            <svg width="26" height="34" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="var(--blue-light)" strokeWidth="2"/>
              <path d="M20 20L16.5 16.5" stroke="var(--blue-light)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <input
            type="search"
            className={styles.input}
            placeholder="Search projects…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
      )}
    </div>
  </div>
);

}
 