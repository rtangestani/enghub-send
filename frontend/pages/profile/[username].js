//frontend//pages//profile//[username].js
// frontend/pages/profile/[username].js
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const abs = (u) => (u && u.startsWith("/uploads") ? `${API_BASE}${u}` : u);
const dashId = (pid12) => String(pid12 || '').replace(/(\d{3})(?=\d)/g, '$1-');
// Helpers for pretty link display
const hostFromUrl = (u) => {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
};

const prettyNameForHost = (host) => {
  const h = (host || "").toLowerCase();
  const map = {
    "github.com": "GitHub",
    "gitlab.com": "GitLab",
    "bitbucket.org": "Bitbucket",
    "linkedin.com": "LinkedIn",
    "facebook.com": "Facebook",
    "instagram.com": "Instagram",
    "twitter.com": "Twitter",
    "x.com": "X",
    "youtube.com": "YouTube",
    "t.me": "Telegram",
    "medium.com": "Medium",
    "stackoverflow.com": "Stack Overflow",
    "behance.net": "Behance",
    "dribbble.com": "Dribbble",
    "kaggle.com": "Kaggle",
  };
  return map[h] || host || "Website";
};

const Favicon = ({ url }) => {
  const host = hostFromUrl(url);
  // use site favicon; fallback hides the <img> if it fails
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
      alt=""
      width={16}
      height={16}
      style={{ display: "inline-block", borderRadius: 3 }}
      onError={(e) => { e.currentTarget.style.display = "none"; }}
    />
  );
};

const normalizeUrl = (s) => {
  if (!s) return "";
  let t = String(s).trim();
  // Add scheme if missing (supports "github.com/you", "linkedin.com/in/you", etc.)
  if (!/^https?:\/\//i.test(t)) t = "https://" + t.replace(/^\/+/, "");
  try {
    // Validate
    const u = new URL(t);
    return u.href;
  } catch {
    return "";
  }
};

export default function ProfileView() {
  const router = useRouter();
  const { username } = router.query;

  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // who is logged in (to show "Edit profile" link if it's me)
  const [me, setMe] = useState(null);
  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("enghub:user") : null;
    setMe(raw ? JSON.parse(raw) : null);
  }, []);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    (async () => {
      try {
        const u = await fetch(`${API_BASE}/api/profile/${encodeURIComponent(username)}`).then(r => r.json());
        if (u?.error) throw new Error(u.error);
        setUser(u);

        const ps = await fetch(`${API_BASE}/api/projects?owner=${encodeURIComponent(username)}`).then(r => r.json());
        setProjects(Array.isArray(ps) ? ps : []);
        setMsg("");
      } catch (e) {
        setMsg(e.message || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, [username]);

  return (
    <div className="container" style={{ padding: "18px 0 36px" }}>
      {loading && <div className="card" style={{ padding: 12 }}>Loading…</div>}
      {msg && !loading && <div className="card" style={{ padding: 12, color: "#ffb4b4" }}>{msg}</div>}

      {user && (
        <div className="pageGrid">
          {/* LEFT */}
          <aside>
            <div
              className="card"
              style={{
                padding: 12,
                display: "grid",
                gap: 10,
                alignItems: "center",
                justifyItems: "center",
                overflow: "hidden",
                caretColor: "transparent",
                userSelect: "none",
              }}
            >
              <img
                src={((abs(user.avatar) || "/images/avatar1.png")).split("?")[0]}
                onError={(e) => { e.currentTarget.src = "/images/avatar1.png"; }}
                alt=""
                width={96}
                height={96}
                style={{ objectFit: "cover", borderRadius: "50%", border: "1px solid var(--line)" }}
              />

              {(() => {
                const uname = String(user.username || "");
                const isLong = uname.length > 20;
                return (
                  <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
                    <span
                      title={`@${uname}`}
                      style={{
                        display: "block",
                        border: "1px solid var(--line)",
                        background: "var(--panel)",
                        color: "var(--text)",
                        borderRadius: 999,
                        padding: "6px 10px",
                        fontWeight: 700,
                        boxShadow: "0 1px 0 rgba(0,0,0,.04)",
                        maxWidth: "calc(100% - 24px)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        textAlign: "center",
                        fontSize: isLong ? 12 : 14,
                        lineHeight: "18px",
                      }}
                    >
                      @{uname}
                    </span>
                  </div>
                );
              })()}

              {/* show name only if different from username */}
              {user.name &&
                user.name.toLowerCase() !== String(user.username || "").toLowerCase() && (
                  <div style={{ textAlign: "center", color: "var(--muted)" }}>{user.name}</div>
                )}

              {/* Edit link for the owner */}
              {me?.username === user.username && (
                <Link
                  href={`/profile/${user.username}/edit`}
                  className="inlineLink"
                  style={{ fontSize: 13 }}
                >
                  Edit profile
                </Link>
              )}

{/* Skills */}
{user.skills && (
  <div style={{ width: "100%" }}>
    <div style={{ fontWeight: 700, textAlign: "center", margin: "6px 0" }}>Skills</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
      {(Array.isArray(user.skills) ? user.skills : JSON.parse(user.skills || "[]")).map((s, i) => (
        <span
          key={i}
          style={{
            border: "1px solid var(--line)",
            background: "var(--panel)",
            borderRadius: 999,
            padding: "6px 10px",
            fontSize: 13,
          }}
        >
          {s}
        </span>
      ))}
    </div>
  </div>
)}



              {/* Links */}
              {user.links && (
                <div style={{ width: "100%", marginTop: 8 }}>
                  <div style={{ fontWeight: 700, textAlign: "center", marginBottom: 6 }}>Links</div>

                  <div style={{ display: "grid", gap: 6, width: "100%" }}>
                    {(() => {
                      const raw = user.links;
                      let parsed = [];
                      try {
                        parsed = Array.isArray(raw) ? raw : (raw ? JSON.parse(raw) : []);
                      } catch {
                        parsed = raw;
                      }

                      // Normalize everything to {label, url} with an absolute URL
                      const norm = [];
                      if (Array.isArray(parsed)) {
                        for (const item of parsed) {
                          if (!item) continue;
                          if (typeof item === "string") {
                            const url = normalizeUrl(item);
                            if (url) norm.push({ label: "", url });
                          } else if (typeof item === "object") {
                            if (item.url) {
                              const url = normalizeUrl(item.url);
                              if (url) norm.push({ label: item.label || "", url });
                            } else {
                              for (const [label, v] of Object.entries(item)) {
                                const url = normalizeUrl(v);
                                if (url) norm.push({ label, url });
                              }
                            }
                          }
                        }
                      } else if (parsed && typeof parsed === "object") {
                        for (const [label, v] of Object.entries(parsed)) {
                          const url = normalizeUrl(v);
                          if (url) norm.push({ label, url });
                        }
                      }
                      return norm;
                    })().map((lnk, i) => {
                      if (!lnk?.url) return null;
                      const host = hostFromUrl(lnk.url);
                      const display = (lnk.label && lnk.label.trim()) || prettyNameForHost(host);
                      return (
                        <a
                          key={i}
                          href={lnk.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inlineLink"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            border: "1px solid var(--line)",
                            background: "var(--panel)",
                            borderRadius: 8,
                            padding: "8px 10px",
                            textDecoration: "none",
                            color: "var(--text)",
                            boxShadow: "0 1px 0 rgba(0,0,0,.04)",
                          }}
                          title={lnk.url}
                        >
                          <Favicon url={lnk.url} />
                          <span style={{ fontWeight: 600 }}>{display}</span>
                          <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12 }}>{host}</span>
                        </a>
                      );
                    })}

                    



                  </div>
                </div>
              )}

              {/* contacts / links (if any) */}
              
              


            </div>
          </aside>

          {/* CENTER – Bio first, then projects */}
          <main style={{ display: "grid", gap: 16 }}>
            <div className="card" style={{ padding: 12 }}>
              <h3 style={{ margin: 0, marginBottom: 6 }}>Bio</h3>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{user.bio || "—"}</pre>
            </div>

            {projects.length === 0 && (
              <div className="card" style={{ padding: 12, color: "var(--muted)" }}>
                No projects yet.{" "}
                <Link href="/upload" className="inlineLink">
                  <b><u>Upload one!</u></b>
                </Link>
              </div>
            )}

            {projects.map((p) => (
              <Link
                key={p.public_id}
                href={`/projects/${dashId(p.public_id)}`}
                className="card"
                style={{ display: "flex", gap: 16, padding: 12 }}
              >
                <img
                  src={`${((abs(p.image) || "/images/placeholder.png")).split("?")[0]}?t=${dashId(p.public_id)}`}
                  onError={(e) => { e.currentTarget.src = "/images/placeholder.png"; }}
                  alt=""
                  width={200}
                  height={120}
                  style={{ objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }}
                />

                <div>
                  <div style={{ fontWeight: 700 }}>{p.title}</div>
                  <div style={{ color: "var(--muted)" }}>{p.description}</div>
                </div>
              </Link>
            ))}
          </main>

          {/* RIGHT – references */}
<aside className="hideOnMobile">
  {/* Referenced by (incoming citations) */}
  <div
    className="card"
    style={{
      padding: 12,
      display: "grid",
      gap: 10,
      overflow: "hidden" // prevent any spill
    }}
  >
    <h3 style={{ margin: 0 }}>Referenced by</h3>
    <div style={{ fontSize: 12, color: "var(--muted)" }}>
      Latest count: {user.referenced_by_count ?? (user.referenced_by_users?.length || 0)}
    </div>

<ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
  {(user.referenced_by_projects || []).map((p) => (
    <li key={p.public_id}
        style={{
          display: "grid",
          gridTemplateColumns: "24px 1fr",
          gap: 8,
          alignItems: "center",
          padding: "6px 0",
          borderBottom: "1px solid var(--line)"
        }}
    >
      <img
        src={`${((abs(p.image) || "/images/placeholder.png")).split("?")[0]}`}
        alt=""
        width={24}
        height={24}
        style={{ borderRadius: 4, border: "1px solid var(--line)", objectFit: "cover" }}
        onError={(e) => { e.currentTarget.src = "/images/placeholder.png"; }}
      />
      <div style={{ minWidth: 0 }}>
        <Link
          href={`/projects/${dashId(p.public_id)}`}
          className="inlineLink"
          style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
        >
          {p.title || "(untitled project)"}{" "}
        </Link>
        <div style={{ color: "var(--muted)", fontSize: 12 }}>
          by @{p.owner_username}
        </div>
      </div>
    </li>
  ))}
  {(user.referenced_by_projects || []).length === 0 && (
    <li style={{ color: "var(--muted)" }}>—</li>
  )}
</ul>

  </div>

  {/* They referenced (outgoing citations) */}
  <div
    className="card"
    style={{
      padding: 12,
      display: "grid",
      gap: 10,
      marginTop: 12,
      overflow: "hidden" // prevent spill
    }}
  >
    <h3 style={{ margin: 0 }}>They referenced</h3>
    <div style={{ fontSize: 12, color: "var(--muted)" }}>
      Latest count: {user.referenced_to_count ?? (user.referenced_to_users?.length || 0)}
    </div>

    {/* Internal (users) */}
<ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
  {(user.referenced_to_projects || []).map((p) => (
    <li key={p.public_id}
        style={{
          display: "grid",
          gridTemplateColumns: "24px 1fr",
          gap: 8,
          alignItems: "center",
          padding: "6px 0",
          borderBottom: "1px solid var(--line)"
        }}
    >
      <img
        src={`${((abs(p.image) || "/images/placeholder.png")).split("?")[0]}`}
        alt=""
        width={24}
        height={24}
        style={{ borderRadius: 4, border: "1px solid var(--line)", objectFit: "cover" }}
        onError={(e) => { e.currentTarget.src = "/images/placeholder.png"; }}
      />
      <div style={{ minWidth: 0 }}>
        <Link
          href={`/projects/${dashId(p.public_id)}`}
          className="inlineLink"
          style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
        >
          {p.title || "(untitled project)"}
        </Link>
        <div style={{ color: "var(--muted)", fontSize: 12 }}>
          by @{p.owner_username}
        </div>
      </div>
    </li>
  ))}
  {(user.referenced_to_projects || []).length === 0 && (
    <li style={{ color: "var(--muted)" }}>—</li>
  )}
</ul>


    {/* External references given (if any) */}
    {user.referenced_to_externals && user.referenced_to_externals.length > 0 && (
      <>
        <div style={{ fontWeight: 600, margin: "8px 0 4px" }}>External sources:</div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {user.referenced_to_externals.map((ref, i) => {
            const host = hostFromUrl(ref.ref_url);
            const displayText = (ref.ref_desc?.trim() || host || ref.ref_url || "").trim();
            return (
              <li key={i} style={{ padding: "4px 0" }}>
                <a
                  href={ref.ref_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inlineLink"
                  title={ref.ref_url}
                  style={{
                    display: "block",                // let it wrap as a block element
                    maxWidth: "100%",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                    whiteSpace: "normal"
                  }}
                >
                  {displayText}
                </a>
              </li>
            );
          })}
        </ul>
      </>
    )}
  </div>
</aside>


        </div>
      )}
    </div>
  );
}
