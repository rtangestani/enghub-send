import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const abs = (url) => (url && url.startsWith("/uploads") ? `${API_BASE}${url}` : url);

export default function ExpertsSidebar({ people = [] }) {
  const list = Array.from(
    new Map(
      (people || [])
        .filter(Boolean)
        .map((p) => [String(p.username || "").toLowerCase(), p])
    ).values()
  );

  return (
    <div
      className="card"
      style={{ padding: 12, display: "grid", gap: 10, overflow: "hidden" }} // keep children inside
    >
      <h3 style={{ margin: 0 }}>People well-known in this topic</h3>

      {list.length === 0 && <div style={{ color: "var(--muted)" }}>—</div>}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {list.map((p) => {
          const username = String(p.username || "");
          const name = String(p.name || "");
          const avatar = abs(p.avatar) || "/images/avatar1.png";

          return (
            <li
              key={username || Math.random()}
              style={{
                width: "100%",
                boxSizing: "border-box",
                overflow: "hidden",
                border: "1px solid var(--line)",
                borderRadius: 10,
                background: "var(--panel)",
                padding: 8,
              }}
            >
              {/* Grid layout: fixed avatar + flexible text */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  alignItems: "center",
                  gap: 10,
                  minWidth: 0, // allow truncation
                }}
              >
                <img
                  src={avatar}
                  alt=""
                  width={40}
                  height={40}
                  onError={(e) => { e.currentTarget.src = "/images/avatar1.png"; }}
                  style={{ borderRadius: "50%", border: "1px solid var(--line)", flex: "none" }}
                />

                <div style={{ minWidth: 0 }}>
                  <div
                    title={`@${username}`}
                    style={{
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      lineHeight: "18px",
                      maxWidth: "100%",
                    }}
                  >
                    <Link href={`/profile/${username}`} className="inlineLink" style={{ display: "inline-block", maxWidth: "100%" }}>
                      @{username}
                    </Link>
                  </div>

                  <div
                    title={name || "Engineer"}
                    style={{
                      color: "var(--muted)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      lineHeight: "18px",
                      maxWidth: "100%",
                    }}
                  >
                    {name || "Engineer"}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
