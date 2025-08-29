// frontend/pages/projects/[id].js
import { useRouter } from "next/router";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import PeopleGraph from "../../components/PeopleGraph";
import styles from "../../components/ProjectPage.module.css";
import AttachmentList from "../../components/AttachmentList";
import CommentsSection from "../../components/CommentsSection";
import { authHeader } from '../../lib/auth'; // adjust ../ path to where your file lives

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const abs = (u) => (u && u.startsWith("/uploads") ? `${API_BASE}${u}` : u);
const dashId = (pid12) => String(pid12 || '').replace(/(\d{3})(?=\d)/g, '$1-');

// helpers
const hostFromUrl = (u) => {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
};

export default function ProjectDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [newComment, setNewComment] = useState("");
  const [tab, setTab] = useState("overview"); 
  const imgBust = useMemo(() => Date.now(), [project?.image]);

  const user =
    typeof window !== "undefined"
      ? JSON.parse(localStorage.getItem("enghub:user") || "null")
      : null;

  useEffect(() => {
    setProject(null);
    if (!id) return;
    setLoading(true);
    const code = String(id || "").replace(/\D/g, "");
if (code.length !== 12) { setErr("Invalid project URL"); setLoading(false); return; }

    fetch(`${API_BASE}/api/projects/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) throw new Error(data.error);
        setProject(data);
        setErr("");
      })
      .catch((e) => setErr(e.message || "Failed to load project"))
      .finally(() => setLoading(false));
  }, [id]);

  const commentsForDisplay = useMemo(() => {
    if (!project?.comments) return [];
    return project.comments.map((c) => ({
      id: c.id,
      author: {
        name: c.name || c.username,
        username: c.username,
        avatar: abs(c.avatar) || "/images/avatar1.png",
      },
      text: c.text,
    }));
  }, [project]);





  // Pretty share key: dashed 12-digit public id if present, else numeric id
// Pretty share key: always dashed 12-digit public id
{/*const shareKey = useMemo(() => {
  if (!project?.public_id) return "";
  return String(project.public_id).replace(/(\d{3})(?=\d)/g, "$1-");
}, [project?.public_id]); */}
const shareKey = project ? dashId(project.public_id) : "";


  // Optional: canonicalize the URL to the dashed public id if available
useEffect(() => {
  if (!project?.public_id) return;
  const pretty = String(project.public_id).replace(/(\d{3})(?=\d)/g, "$1-");

  // Only canonicalize if we’re already on the same project (digits match)
  const currentDigits = String(id || '').replace(/\D/g, '');
  if (currentDigits !== project.public_id) return;

  if (id !== pretty) {
    router.replace(`/projects/${pretty}`, undefined, { shallow: true, scroll: false });
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [project?.public_id]);   // <— only depends on the loaded project, not on id

  // LIKE-ONLY (dislike removed)
  async function handleLike() {
    if (!user?.username) return alert("Please log in to like this project.");
    try {
      const res = await fetch(`${API_BASE}/api/projects/${shareKey}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader()  },
        body: JSON.stringify({ username: user.username, value: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to like");
      setProject((p) => p && { ...p, likes_count: data.likes_count });
    } catch (e) {
      alert(e.message);
    }
  }

  async function handlePostComment() {
    const text = newComment.trim();
    if (!text) return;
    if (!user?.username) return alert("Please log in to comment.");
    try {
      const res = await fetch(`${API_BASE}/api/projects/${shareKey}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader()  },
        body: JSON.stringify({ username: user.username, text }),
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created?.error || "Failed to comment");
      setProject((p) => p && { ...p, comments: [...(p.comments || []), created] });
      setNewComment("");
    } catch (e) {
      alert(e.message);
    }
  }

  if (loading) {
    return (
      <>
        <div className="container" style={{ padding: "24px 0" }}>Loading…</div>
      </>
    );
  }

  if (err || !project) {
    return (
      <>
        <div className="container" style={{ padding: "24px 0", color: "#ffb4b4" }}>
          {err || "Project not found."}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="container" style={{ padding: "36px 0 36px" }}>
        <div className={styles.grid}>

          {/* LEFT rail (sticky) */}
          <aside className={`${styles.panel} ${styles.left}`}>
            <img
              src={`${((abs(project?.image) || "/images/placeholder.png")).split("?")[0]}?t=${imgBust}`}
              onError={(e) => { e.currentTarget.src = "/images/placeholder.png"; }}
              alt={project.title}
              className={styles.thumb}
            />

            <div className={styles.stack}>
              <div className={styles.block}>
                <strong>Project ID:</strong>{" "}
                {(project.public_id || String(shareKey).padStart(12, "0")).replace(/(\d{3})(?=\d)/g, "$1-")}
              </div>

              <div className={styles.block}>
                <div className={styles.blockTitle}>Share</div>
                <div className={styles.copyRow}>
                  <input
                    readOnly
                    className={styles.inputMono}
                    value={
                      typeof window !== "undefined"
                        ? `${window.location.origin}/projects/${shareKey}`
                        : ""
                    }
                    style={{ caretColor: "transparent" }}
                  />
                  <button
                    className={styles.btn}
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined" && navigator?.clipboard) {
                        navigator.clipboard.writeText(`${window.location.origin}/projects/${shareKey}`);
                      }
                    }}
                  >
                    Copy
                  </button>
                </div>
              </div>


<button
  className={`${styles.block} ${styles.btn} ${styles.btnFull}`}
  type="button"
  onClick={() => {
    if (!user?.username) {
      alert("Please log in to download files.");
      return;
    }
    // Get token from localStorage
    const token = localStorage.getItem("enghub:token");
    if (!token) {
      alert("Please log in to download files.");
      return;
    }
    // Open download with auth header
    window.location.href = `${API_BASE}/api/projects/${shareKey}/download-all?token=${token}`;

  }}
>
  Download all files ( {project.attachments?.length || 0} )
</button>

              <div className={styles.block}>
                <div className={styles.statRow}>
                  <button type="button" className={styles.btn} onClick={handleLike}>
                    👍 {project.likes_count || 0}
                  </button>
                  <span>💬 {project.comments_count ?? (project.comments?.length || 0)}</span>
                </div>
              </div>

              <div className={styles.block}>
                <div className={styles.blockTitle}>Creator & collaborators</div>
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  <li><Link href={`/profile/${project.owner_username}`} className="inlineLink">@{project.owner_username}</Link></li>
                  {Array.from(
                    new Set((project.comments || [])
                      .map(c => c.username)
                      .filter(u => u && u !== project.owner_username))
                  ).slice(0, 6).map(u => (
                    <li key={u}><Link href={`/profile/${u}`} className="inlineLink">@{u}</Link></li>
                  ))}
                </ul>
              </div>

              <div className={styles.block}>
                <div className={styles.blockTitle}>Similar projects</div>
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  <li><Link href="/explore" className="inlineLink">Explore more…</Link></li>
                </ul>
              </div>
            </div>
          </aside>

          {/* CENTER */}
          <main>
            <div className={styles.panel}>
              <h1 className={styles.bigTitle}>{project.title}</h1>
{user?.username === project.owner_username && (
  <div style={{ marginTop: 6 }}>
    <Link href={`/projects/${shareKey}/edit`} className="inlineLink">
      <b><u>Edit this project</u></b>
    </Link>
  </div>
)}
<div className={styles.meta}>
  by <Link href={`/profile/${project.owner_username}`} className="inlineLink">@{project.owner_username}</Link>
  &nbsp;• 📥 {project.downloads || 0} • 👍 {project.likes_count || 0} • 💬 {project.comments_count ?? (project.comments?.length || 0)}
</div>

{/* Tabs */}
<div style={{ display:"flex", gap:10, margin:"10px 0 6px" }}>
  <button type="button" className={styles.btn} onClick={()=>setTab("overview")} style={{ opacity: tab==="overview"?1:.6 }}>
    Overview
  </button>
  <button type="button" className={styles.btn} onClick={()=>setTab("graph")} style={{ opacity: tab==="graph"?1:.6 }}>
    Reference network
  </button>
</div>

{tab === "overview" && (
  <p style={{ lineHeight: 1.6 }}>
    {project.long_description || project.longDescription || project.description}
  </p>
)}
{tab === "graph" && (
  <div className={styles.panel} style={{ padding: 12, marginTop: 8 }}>
    <div className={styles.graphBox}>
      <PeopleGraph projectPublicId={project.public_id} maxHeight={420} />
    </div>
    <div className={styles.graphBoxFooter}>
      <Link href={`/projects/${shareKey}/graph`} className="inlineLink" prefetch={false}>
        Open full size →
      </Link>
    </div>
  </div>
)}



            </div>

            {/* Quick edit removed */}

            {!!project.attachments?.length && (
              <div className={`${styles.panel} ${styles.attach}`}>
                <h3>All attached files</h3>
                <AttachmentList attachments={project.attachments} />
              </div>
            )}

            {/* Comments display + composer */}
            <div className={`${styles.panel} ${styles.attach}`}>
              <h3>Comments</h3>
              <CommentsSection comments={commentsForDisplay} allowWrite={false} linkAuthors />
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                <textarea
                  placeholder={user ? "Write a comment…" : "Log in to comment"}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  disabled={!user}
                  style={{
                    minHeight: 44, borderRadius: 10, border: "1px solid var(--line)",
                    background: "var(--input-bg)", color: "var(--text)", padding: 10, resize: "vertical",
                  }}
                />
                <button onClick={handlePostComment} disabled={!user || !newComment.trim()} className={styles.btn} style={{ height: 44 }}>
                  Post
                </button>
              </div>
            </div>
          </main>

          {/* RIGHT */}
<aside className="hideOnMobile">
  {/* Referenced by (incoming) */}
  <div
    className="card"
    style={{ padding: 12, display: "grid", gap: 10, overflow: "hidden" }}
  >
    <h3 style={{ margin: 0 }}>Referenced by</h3>
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {(project.references_by || []).map((r) => (
        <li key={`by-${r.id}`}
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
            src={`${((abs(r.src_image) || "/images/placeholder.png")).split("?")[0]}`}
            alt=""
            width={24}
            height={24}
            style={{ borderRadius: 4, border: "1px solid var(--line)", objectFit: "cover" }}
            onError={(e) => { e.currentTarget.src = "/images/placeholder.png"; }}
          />
          <div style={{ minWidth: 0 }}>
            {r.src_public_id ? (
              <Link
                prefetch={false}
                href={`/projects/${String(r.src_public_id).replace(/(\d{3})(?=\d)/g, "$1-")}`}
                className="inlineLink"
                style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                title={r.src_title || ""}
              >
                {r.src_title || String(r.src_public_id).replace(/(\d{3})(?=\d)/g, "$1-")}
              </Link>
            ) : (
              <span className="inlineLink" style={{ color: "var(--muted)" }}>—</span>
            )}
            {r.src_owner_username && (
              <div style={{ color: "var(--muted)", fontSize: 12 }}>
                by @{r.src_owner_username}
              </div>
            )}
          </div>
        </li>
      ))}
      {(project.references_by || []).length === 0 && (
        <li style={{ color: "var(--muted)" }}>—</li>
      )}
    </ul>
  </div>

  {/* They referenced (outgoing) */}
  <div
    className="card"
    style={{ padding: 12, display: "grid", gap: 10, marginTop: 12, overflow: "hidden" }}
  >
    <h3 style={{ margin: 0 }}>They referenced</h3>

    {/* Internal projects */}
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {(Array.isArray(project.references_to) ? project.references_to : [])
        .filter(r => r.dst_public_id)
        .map((r) => (
          <li key={`to-${r.id}`}
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
              src={`${((abs(r.dst_image) || "/images/placeholder.png")).split("?")[0]}`}
              alt=""
              width={24}
              height={24}
              style={{ borderRadius: 4, border: "1px solid var(--line)", objectFit: "cover" }}
              onError={(e) => { e.currentTarget.src = "/images/placeholder.png"; }}
            />
            <div style={{ minWidth: 0 }}>
              <Link
                prefetch={false}
                href={`/projects/${String(r.dst_public_id).replace(/(\d{3})(?=\d)/g, "$1-")}`}
                className="inlineLink"
                style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                title={r.dst_title || ""}
              >
                {r.dst_title || String(r.dst_public_id).replace(/(\d{3})(?=\d)/g, "$1-")}
              </Link>
              {r.dst_owner_username && (
                <div style={{ color: "var(--muted)", fontSize: 12 }}>
                  by @{r.dst_owner_username}
                </div>
              )}
            </div>
          </li>
        ))
      }
      {/* Empty state when no refs at all */}
      {(!(project.references_to || []).length) && (
        <li style={{ color: "var(--muted)" }}>No references yet</li>
      )}
    </ul>

    {/* External sources */}
    {(() => {
      const externals = (Array.isArray(project.references_to) ? project.references_to : [])
        .filter(r => !r.dst_public_id && r.ref_url);
      if (!externals.length) return null;
      const hostFromUrl = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

      return (
        <>
          <div style={{ fontWeight: 600, margin: "8px 0 4px" }}>External sources:</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {externals.map((r) => {
              const host = hostFromUrl(r.ref_url);
              const text = (r.ref_desc?.trim() || host || r.ref_url || "").trim();
              return (
                <li key={`ex-${r.id}`} style={{ padding: "4px 0" }}>
                  <a
                    href={r.ref_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inlineLink"
                    title={r.ref_url}
                    style={{
                      display: "block",
                      maxWidth: "100%",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                      whiteSpace: "normal"
                    }}
                  >
                    {text}
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      );
    })()}
  </div>
</aside>


        </div>
      </div>
    </>
  );
}
