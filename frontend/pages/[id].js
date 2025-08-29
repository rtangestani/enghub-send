import { useRouter } from "next/router";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import styles from "../components/ProjectPage.module.css";
import AttachmentList from "../components/AttachmentList";
import CommentsSection from "../components/CommentsSection";
import { authHeader } from "../lib/auth";  // adjust the path as needed
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

 // 🔧 helper: pretty 12-digit id → 000-000-000-000
function dashId(s) {
  return String(s || "").replace(/(\d{3})(?=\d)/g, "$1-");
}
// 🔧 helper: Authorization header from localStorage

// Pretty print public_id as 000-000-000-000; otherwise fall back to numeric id


export default function ProjectDetail(){
  const { query } = useRouter();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const imgBust = useMemo(() => Date.now(), [project?.image]);
  const rawId = useMemo(() => String(query.id || ""), [query.id]);
   // Pretty print public_id as 000-000-000-000; otherwise fall back to numeric id
   const shareKey = useMemo(() => {
     if (project?.public_id) {
       return String(project.public_id).replace(/(\d{3})(?=\d)/g, "$1-");
     }
     return String(project?.id || "");
   }, [project?.public_id, project?.id]);

// Pretty print public_id as 000-000-000-000; otherwise fall back to numeric id


// ✅ handlers are now visible to JSX
async function handleLike(value = 1) {
  try {
    await fetch(`${API_BASE}/api/projects/${shareKey}/like`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...authHeader() },
  body: JSON.stringify({ value: 1 }) // username not needed; backend reads req.user
});
    if (!res.ok) throw new Error("Like failed");
    const counts = await res.json(); // { likes_count, dislikes_count }
    setProject(p => (p ? { ...p, ...counts } : p));
  } catch (e) {
    alert(e.message || "Like failed");
  }
}

async function handleAddComment(text) {
  const body = { text: String(text || "").trim() };
  if (!body.text) return;
  try {
    const res = await fetch(`${API_BASE}/api/projects/${shareKey}/comments`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...authHeader() },
  body: JSON.stringify({ value: 1 }) // username not needed; backend reads req.user
});
    if (!res.ok) throw new Error("Comment failed");
    const created = await res.json();
    setProject(p =>
      p
        ? {
            ...p,
            comments: [...(p.comments || []), created],
            comments_count:
              (p.comments_count ?? (p.comments?.length || 0)) + 1
          }
        : p
    );
  } catch (e) {
    alert(e.message || "Comment failed");
  }
}

useEffect(() => {
  if (!rawId) return;
  async function fetchProject() {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/projects/${rawId}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      const data = await res.json();
      setProject(data);
    } catch (err) {
      console.error("Error fetching project:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  fetchProject();
}, [rawId]);


if (loading) {
  return (
    <div className="container" style={{ padding:'24px 0' }}>
      Loading…
    </div>
  );
}
if (error) {
  return (
    <div className="container" style={{ padding:'24px 0', color:'#ff6b6b' }}>
      {error}
    </div>
  );
}



  if(!project) return <><div className="container" style={{ padding:'24px 0' }}>Project not found.</div></>;



  return (
    <>
      <div className="container" style={{ padding:"0 0 36px" }}>
        <div className={styles.grid}>

          {/* LEFT: fixed panel */}
          <aside className={`${styles.panel} ${styles.left}`}>
              <img
                src={`${(project.image || "/images/default-project.png").split("?")[0]}?t=${imgBust}`}
                onError={(e) => {
                  e.currentTarget.src = "/images/default-project.png";
                }}
                alt={project.title}
                className={styles.thumb}
              />
            <div className={styles.badge}>
              Project ID: {project.public_id ? shareKey : project.id}
            </div>
              <div className={styles.badge}>
                Share:{" "}
                <input
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/projects/${shareKey}`}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "0",
                    color: "var(--text)",
                    caretColor: "transparent",
                  }}
                  onFocus={(e) => e.target.select()}
                />
              </div>


            <a
              href="#"
              className={styles.badge}
              onClick={(e) => {
                e.preventDefault();
                const token = (typeof window !== "undefined") ? (localStorage.getItem("enghub:token") || "") : "";
                const url = `${API_BASE}/api/projects/${shareKey}/download-all${token ? `?token=${encodeURIComponent(token)}` : ""}`;
                window.location.href = url; // triggers the zip download
              }}
            >
              Download all files ( {project.downloads || 0} )
            </a>
            <div className={styles.badge}>👍 {project.likes_count || 0}</div>
            <div className={styles.badge}>
              Creator:
              <ul style={{ paddingLeft:18, marginTop:6 }}>
                <li>@{project.owner_username}</li>
              </ul>
            </div>

            {/* TODO: fetch and render similar projects here */}  
          </aside>

          {/* CENTER */}
          <main>
            <div className={styles.panel}>
              <h1 className={styles.bigTitle}>{project.title}</h1>

              <div className={styles.meta}>
                <div style={{ marginTop: 8 }}>
                  <button onClick={() => handleLike(1)} className="btn">👍 Like</button>
                  
                </div>
                📥 {project.downloads ?? 0}
                {" • "} 👍 {project.likes_count ?? 0}
                {" • "} 💬 {project.comments_count ?? (Array.isArray(project.comments) ? project.comments.length : 0)}
              </div>
              <p style={{ lineHeight:1.6 }}>{project.longDescription || project.description}</p>
            </div>

            {!!project.attachments?.length && (
              <div className={`${styles.panel} ${styles.attach}`}>
                <h3>All attached files</h3>
                <AttachmentList attachments={project.attachments} />
              </div>
            )}

            {/* Comments with input field at the bottom */}
            <div className={`${styles.panel} ${styles.attach}`}>
              <h3>Comments / Q&A</h3>
              <CommentsSection
                comments={project.comments || []}
                allowWrite
                onSubmit={handleAddComment}
              />
            </div>
          </main>

          {/* RIGHT */}
          <aside className={`${styles.panel}`}>
            <h3>People/projects this work referenced</h3>
            <ul style={{ paddingLeft:18 }}>
            {(project.references_to || []).map((ref, i) => (
              <li key={i}>
                {ref.dst_public_id && ref.dst_title ? (
                  <Link href={`/projects/${dashId(ref.dst_public_id)}`} className="inlineLink">
                    {ref.dst_owner_username}: {ref.dst_title}
                  </Link>
                ) : ref.ref_url ? (
                  <a href={ref.ref_url} target="_blank" rel="noopener noreferrer" className="inlineLink">
                    {ref.ref_desc || ref.ref_url}
                  </a>
                ) : "—"}
              </li>
            ))}
            </ul>
            <hr style={{ borderColor:"var(--line)", margin:"12px 0" }} />
            <h3>People who referenced this work</h3>
            <ul style={{ paddingLeft:18 }}>
                {(project.references_by || []).map((ref, i) => (
                  <li key={i}>
                    {ref.src_public_id && ref.src_title ? (
                      <Link href={`/projects/${dashId(ref.src_public_id)}`} className="inlineLink">
                        {ref.src_owner_username}: {ref.src_title}
                      </Link>
                    ) : "—"}
                  </li>
                ))}
            </ul>
          </aside>
        </div>
      </div>
    </>
  );
}
