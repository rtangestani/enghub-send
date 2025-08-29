// frontend/components/Navbar.js
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import styles from "./Navbar.module.css";
import { clearAuth } from "../lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const abs = (url) => (url && url.startsWith("/uploads") ? `${API_BASE}${url}` : url);
const AVATAR_FALLBACK_DATA_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="12" fill="#e9edf0"/>
      <circle cx="32" cy="24" r="12" fill="#bfc6cc"/>
      <path d="M12 54c4-14 36-14 40 0" fill="#cfd5db"/>
    </svg>
  `);
export default function Navbar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // close menu on route change
  useEffect(() => {
    const handle = () => setMenuOpen(false);
    router.events?.on("routeChangeStart", handle);
    return () => router.events?.off("routeChangeStart", handle);
  }, [router.events]);

  // keep search query in sync
  useEffect(() => {
    setQ((router.query.q || "").toString());
  }, [router.query.q]);

  // hydrate user on mount + storage changes (other tabs/windows)
  useEffect(() => {
    const read = () => {
      const raw =
        typeof window !== "undefined"
          ? localStorage.getItem("enghub:user")
          : null;
      setUser(raw ? JSON.parse(raw) : null);
    };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);

  // also re-read when the route changes (after login redirect)
  useEffect(() => {
    const raw =
      typeof window !== "undefined"
        ? localStorage.getItem("enghub:user")
        : null;
    setUser(raw ? JSON.parse(raw) : null);
  }, [router.asPath]);

  function onSubmit(e) {
    e.preventDefault();
    router.push(q ? `/explore?q=${encodeURIComponent(q)}` : "/explore");
  }

 function logout() {
  clearAuth();     // clears BOTH engHub token + user
  setUser(null);
  router.push("/");
}

  return (
    <nav className={styles.nav}>
      <div className="container">
        <div className={styles.inner}>
          <Link href="/" className={styles.logo}>
            EngHub
          </Link>
          <Link href="/explore" className={styles.link}>
            Explore
          </Link>

          <form
            onSubmit={onSubmit}
            className={styles.searchForm}
            role="search"
            aria-label="Site search"
          >
            <input
              className={styles.searchInput}
              placeholder="Search projects…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </form>

          {user ? (
            <>
              <div className={styles.menuWrap}>
                <button
                  type="button"
                  className={`${styles.menuBtn}`}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  {/* Strip any existing query and append a new cache‑buster */}
                  <img
                    src={(() => {
                      const raw = (user?.avatar && user?.avatar.startsWith('/uploads'))
                        ? `${(process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000')}${user.avatar}`
                        : (user?.avatar || 'images/avatar1.png');
                      // add cache-buster only for http/https/local paths
                      return raw.startsWith('data:') ? raw : `${raw.split('?')[0]}?t=${Date.now()}`;
                    })()}
                    alt={user?.username || 'avatar'}
                    width={24}
                    height={24}
                    className={styles.menuAvatar}
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = AVATAR_FALLBACK_DATA_URI; }}
                  />
                  <span>@{user.username}</span>
                  <span className={styles.caret} />
                </button>
                {menuOpen && (
                  <div role="menu" className={styles.menu}>
                    <Link
                      href={`/profile/${user.username}`}
                      className={styles.menuItem}
                    >
                      View profile
                    </Link>
                    <Link
                      href={`/profile/${user.username}/edit`}
                      className={styles.menuItem}
                    >
                      Edit profile
                    </Link>
                    <div className={styles.menuSep} />
                    <button
                      type="button"
                      className={styles.menuItem}
                      onClick={logout}
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
              <Link href="/upload" className={styles.loginBtn}>
                Upload
              </Link>
            </>
          ) : (
            <Link href="/login" className={styles.loginBtn}>
              Log in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
