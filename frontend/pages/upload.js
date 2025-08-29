// frontend/pages/upload.js
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { authHeader } from "../lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const abs = (u) => (u && u.startsWith("/uploads") ? `${API_BASE}${u}` : u);
const dashId = (pid12) => String(pid12 || '').replace(/(\d{3})(?=\d)/g, '$1-');






export default function Upload() {
  const router = useRouter();

  // Logged in user
  const [user, setUser] = useState(null);

  // Project info fields
  const [title, setTitle] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [category, setCategory] = useState("");
  const [details, setDetails] = useState("");

  // NEW: cover image (project thumbnail)
  const [coverUrl, setCoverUrl] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);

  // Data types (second category)
  const DATA_TYPES = ["Publications","CAD Models","Images","Videos","Datasets","Simulation Files","Reports","Code","Notebooks","3D Scenes"];
  const [types, setTypes] = useState([]);
  const toggleType = (t) => setTypes(prev => prev.includes(t) ? prev.filter(x=>x!==t) : [...prev, t]);

  // Tags
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState([]);

  // Collaborators
  const [collaboratorInput, setCollaboratorInput] = useState("");
  const [collaborators, setCollaborators] = useState([]);

  // Typeahead
  const [suggestions, setSuggestions] = useState([]);
  const [openSuggest, setOpenSuggest] = useState(false);
  const suggestTimer = useRef(null);

  // References
  const [refDesc, setRefDesc] = useState("");
  const [refUrl, setRefUrl] = useState("");
  const [refProjectId, setRefProjectId] = useState("");
  const [references, setReferences] = useState([]);
// detect 12-digit project id and hide the URL input when present
const idDigits = (refProjectId || "").replace(/[^\d]/g, "");
const hideUrl = idDigits.length === 12;

// if a 12-digit ID is present, clear URL so we never send both
useEffect(() => {
  if (hideUrl && refUrl) setRefUrl("");
}, [hideUrl, refUrl]);

  // File uploads (attachments)
  const [files, setFiles] = useState([]);

  // Status
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const disciplines = [
    "Mechanical", "Electrical", "Civil", "Aerospace", "Chemical", "Materials", "Other",
  ];

  useEffect(() => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("enghub:user");
      if (raw) setUser(JSON.parse(raw));
    }
  }, []);

  // ----- Tags
  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    setTags([...tags, t]);
    setTagInput("");
  }
  function removeTag(idx) {
    setTags(tags.filter((_, i) => i !== idx));
  }

  // ----- Collaborators
  function addCollaboratorString() {
    const v = collaboratorInput.trim();
    if (!v) return;
    setCollaborators([...collaborators, v]);
    setCollaboratorInput("");
    setSuggestions([]);
    setOpenSuggest(false);
  }
  function removeCollaborator(idx) {
    setCollaborators(collaborators.filter((_, i) => i !== idx));
  }
  function onCollaboratorChange(e) {
    const v = e.target.value;
    setCollaboratorInput(v);
    clearTimeout(suggestTimer.current);
    if (!v.trim()) { setSuggestions([]); setOpenSuggest(false); return; }
    suggestTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/users/search?q=${encodeURIComponent(v.trim())}`);
        const list = await r.json();
        setSuggestions(Array.isArray(list) ? list : []);
        setOpenSuggest(true);
      } catch {
        setSuggestions([]);
        setOpenSuggest(false);
      }
    }, 200);
  }
  function pickSuggestion(u) {
    setCollaborators([...collaborators, u.username]); // store username
    setCollaboratorInput("");
    setSuggestions([]);
    setOpenSuggest(false);
  }

  // ----- References
function addReference() {
  const d = refDesc.trim();
  const u = refUrl.trim();
  const pid = refProjectId.trim();
  const digits = pid.replace(/[^\d]/g, "");

  // Must have description and either a URL or a 12-digit ID
  if (!d || (!u && digits.length !== 12)) return;

  if (digits.length === 12) {
    // INTERNAL: keep only the ID (no URL)
    setReferences(prev => [...prev, { desc: d, url: "", projectId: pid }]);
  } else {
    // EXTERNAL: needs URL (no projectId)
    setReferences(prev => [...prev, { desc: d, url: u, projectId: "" }]);
  }

  setRefDesc(""); setRefUrl(""); setRefProjectId("");
}


  function removeReference(idx) {
    setReferences(references.filter((_, i) => i !== idx));
  }

  // NEW: upload cover image to /api/upload (no projectId yet)
  async function handleUploadCover(e) {
    const f = e.target.files?.[0];
    if (!f || !user?.username) return;
    setCoverUploading(true);
    setMsg("");
    try {
      const fd = new FormData();
      // IMPORTANT: username BEFORE file – server expects this ordering.
      fd.append("username", user.username);
      fd.append("file", f);
const res = await fetch(`${API_BASE}/api/upload`, {
  method: 'POST',
  headers: { ...authHeader() },
  body: formData
});
      const data = await res.json();
      if (!res.ok || !data?.url) throw new Error(data?.error || "Cover upload failed");
      // Save relative URL; show with abs() so preview works from 3000
      setCoverUrl(data.url);
      setMsg("Cover image uploaded.");
    } catch (err) {
      setMsg(err.message);
    } finally {
      setCoverUploading(false);
    }
  }

  async function onSubmit(e) {
// normalize references before sending
const payloadRefs = (references || []).map(r => {
  const desc = String(r.desc || "").trim();
  const url  = String(r.url  || "").trim();
  const rawId = String(r.projectId || "").replace(/[^\d]/g, "");
  if (rawId.length === 12) return { desc, projectId: rawId }; // internal
  if (url) return { desc, url };                               // external
  return null;
}).filter(Boolean);

    e.preventDefault();
    setMsg("");

    if (!user?.username) {
      setMsg("Please log in first.");
      router.push("/login");
      return;
    }
    if (!title || !shortDesc) {
      setMsg("Title and short description are required.");
      return;
    }
    setBusy(true);
    try {
      // Create the project
const payload = {
  ownerUsername: user.username,
  title,
  description: shortDesc,
  longDescription: details,
  category: category ? [category] : [],
  types,
  tags,
  collaborators,
  references: payloadRefs,   // <-- use normalized refs here
  image: coverUrl || undefined,
};

        const res = await fetch(`${API_BASE}/api/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body: JSON.stringify(payload),
        });

      const ctype = res.headers.get("content-type") || "";
      const project = ctype.includes("application/json") ? await res.json() : { error: await res.text() };
      if (!res.ok) throw new Error(project?.error || "Could not create project");

      // Upload files (IMPORTANT: fields first, file last)
      for (const file of files) {
        const fd = new FormData();
        fd.append("username", user.username);
        fd.append("projectId", project.public_id);
        fd.append("file", file);
        const up = await fetch(`${API_BASE}/api/upload`, {
  method: "POST",
  headers: { ...authHeader() },
  body: fd
});

        const upType = up.headers.get("content-type") || "";
        const upBody = upType.includes("application/json") ? await up.json() : { error: await up.text() };
        if (!up.ok) throw new Error(upBody?.error || "File upload failed");
      }

      setMsg("Done! Redirecting…");
      router.push(`/projects/${dashId(project.public_id)}`);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="container" style={{ padding: "0 0 36px" }}>
        <form onSubmit={onSubmit} className="card" style={{ maxWidth: 720, margin: "24px auto", padding: 18 }}>
          <h2 style={{ marginBottom: 8 }}>Project Information</h2>

          {/* NEW: Cover image picker + preview */}
          <label style={{ fontWeight: 600 }}>Cover image</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "6px 0 12px" }}>
            <img
              src={abs(coverUrl) || "images/default-project.png"}
              alt=""
              width={160}
              height={100}
              style={{ objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }}
              onError={(e) => {
                e.currentTarget.src = "images/default-project.png";
              }}
            />
            <label className="inlineLink" style={{ border:"1px solid var(--line)", borderRadius:8, padding:"8px 12px", cursor:"pointer" }}>
              {coverUploading ? "Uploading…" : "Choose image"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleUploadCover} />
            </label>
          </div>

          <label style={{ fontWeight: 600 }}>Project Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
                 placeholder="Enter a descriptive title for your project"
                 style={{ width: "100%", height: 38, margin: "6px 0 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--publish-btn-bg)", color: "var(--text)", padding: "0 12px" }}/>

          <label style={{ fontWeight: 600 }}>Short Description</label>
          <input value={shortDesc} onChange={(e) => setShortDesc(e.target.value)} maxLength={150}
                 placeholder="Brief summary that appears in search results"
                 style={{ width: "100%", height: 38, margin: "6px 0 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--input-bg)", color: "var(--text)", padding: "0 12px" }}/>

          <label style={{ fontWeight: 600 }}>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
                  style={{ width: "100%", height: 38, margin: "6px 0 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--input-bg)", color: "var(--text)", padding: "0 12px" }}>
            <option value="">Select engineering discipline</option>
            {disciplines.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>

          <label style={{ fontWeight: 600 }}>Detailed Description</label>
          <textarea value={details} onChange={(e) => setDetails(e.target.value)}
                    placeholder="Add a detailed overview, methodology or results..."
                    style={{ width: "100%", minHeight: 120, margin: "6px 0 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--input-bg)", color: "var(--text)", padding: 12, resize: "vertical" }}/>

          {/* Data types */}
          <h3 style={{ marginTop: 16, marginBottom: 8 }}>Data types</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(160px, 1fr))", gap: 8, marginBottom: 12 }}>
            {DATA_TYPES.map(t => (
              <label key={t} style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="checkbox" checked={types.includes(t)} onChange={() => toggleType(t)} />
                {t}
              </label>
            ))}
          </div>

          {/* Tags */}
          <label style={{ fontWeight: 600 }}>Tags</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 6 }}>
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                   placeholder="Add tags to improve discoverability"
                   style={{ width: "100%", height: 38, borderRadius: 8, border: "1px solid var(--line)", background: "var(--publish-btn-bg)", color: "var(--text)", padding: "0 12px" }}/>
            <button type="button" onClick={addTag}
                    style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "0 12px", background: "var(--publish-btn-bg)", color: "var(--text)", cursor: "pointer" }}>
              Add
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {tags.map((tag, idx) => (
              <span key={idx} style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "4px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}>
                {tag}
                <button type="button" onClick={() => removeTag(idx)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--accent)" }}>×</button>
              </span>
            ))}
          </div>

          {/* Collaborators with typeahead */}
          <h3 style={{ marginTop: 24, marginBottom: 8 }}>Collaborators</h3>
          <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 8px" }}>
            Add collaborators by username or email. Start typing to search users.
          </p>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              <input value={collaboratorInput} onChange={onCollaboratorChange}
                     placeholder="Enter collaborator's username or email"
                     style={{ width: "100%", height: 38, borderRadius: 8, border: "1px solid var(--line)", background: "var(--publish-btn-bg)", color: "var(--text)", padding: "0 12px" }}/>
              <button type="button" onClick={addCollaboratorString}
                      style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "0 12px", background: "var(--publish-btn-bg)", color: "var(--text)", cursor: "pointer" }}>
                Add
              </button>
            </div>
            {openSuggest && suggestions.length > 0 && (
              <div style={{
                position: "absolute", left: 0, right: 0, top: 44, zIndex: 10,
                background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8,
                maxHeight: 200, overflowY: "auto"
              }}>
                {suggestions.map(u => (
                  <button key={u.username} type="button" onClick={() => pickSuggestion(u)}
                          style={{ width: "100%", display: "flex", gap: 8, alignItems: "center", padding: "8px 10px",
                                   background: "transparent", border: 0, textAlign: "left", cursor: "pointer" }}>
                    <img src={u.avatar || "/images/avatar1.png"} alt="" width={24} height={24} style={{ borderRadius: "50%", border: "1px solid var(--line)" }}/>
                    <span>@{u.username} — {u.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {collaborators.map((c, idx) => (
              <li key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <span>{c}</span>
                <button type="button" onClick={() => removeCollaborator(idx)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--accent)" }}>
                  Remove
                </button>
              </li>
            ))}
          </ul>

          {/* References */}
          <h3 style={{ marginTop: 24, marginBottom: 8 }}>References</h3>
          <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 8px" }}>Add links to relevant research, projects, or articles.</p>
          {references.map((ref, idx) => (
            <div key={idx} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8, marginBottom: 8, background: "var(--panel)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{ref.desc}</div>
                  <a href={ref.url} target="_blank" rel="noopener" style={{ color: "var(--accent)", textDecoration: "underline", fontSize: 14 }}>{ref.url}</a>
                  {ref.projectId && <div style={{ fontSize: 12, color: "var(--muted)" }}>EngHub Project ID: {ref.projectId}</div>}
                </div>
                <button type="button" onClick={() => removeReference(idx)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: 16 }}>🗑</button>
              </div>
            </div>
          ))}
<div style={{ display: "grid", gap: 6, gridTemplateColumns: "2fr 1.3fr 1fr", marginBottom: 6 }}>
  <input
    value={refDesc}
    onChange={(e) => setRefDesc(e.target.value)}
    placeholder="Reference description"
    style={{ height: 38, borderRadius: 8, border: "1px solid var(--line)", background: "var(--publish-btn-bg)", color: "var(--text)", padding: "0 12px" }}
  />

  {hideUrl ? (
    <div style={{ display: "flex", alignItems: "center", fontSize: 12, color: "var(--muted)" }}>
      Internal link via Project&nbsp;ID — URL not needed
    </div>
  ) : (
    <input
      type="url"
      value={refUrl}
      onChange={(e) => setRefUrl(e.target.value)}
      placeholder="External URL"
      style={{ height: 38, borderRadius: 8, border: "1px solid var(--line)", background: "var(--publish-btn-bg)", color: "var(--text)", padding: "0 12px" }}
    />
  )}

  <input
    value={refProjectId}
    onChange={(e) => setRefProjectId(e.target.value)}
    placeholder="Project ID (e.g., 123-456-789-012)"
    style={{ height: 38, borderRadius: 8, border: "1px solid var(--line)", background: "var(--publish-btn-bg)", color: "var(--text)", padding: "0 12px" }}
  />
</div>

<button
  type="button"
  onClick={addReference}
  style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", background: "var(--publish-btn-bg)", color: "var(--text)", cursor: "pointer", marginBottom: 6 }}
>
  Add Reference
</button>


          {/* File Uploads (attachments) */}
          <h3 style={{ marginTop: 24, marginBottom: 8 }}>Attachments</h3>
<input
  type="file"
  multiple
  onChange={(e) => {
    const picked = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...picked]);  // append instead of replace
    e.target.value = '';                     // allow picking again
  }}
  style={{ display: "block", margin: "6px 0 12px" }}
/>
{files.length > 0 && (
  <ul style={{ margin: "6px 0 12px", paddingLeft: 16 }}>
    {files.map((f,i) => <li key={i}>{f.name}</li>)}
  </ul>
)}


          {msg && (
            <div style={{ color: msg === "Done! Redirecting…" ? "var(--text)" : "#ff6b6b", marginBottom: 10, fontSize: 14 }}>
              {msg}
            </div>
          )}

          <button type="submit" disabled={busy} className="inlineLink"
                  style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", background: "var(--publish-btn-bg)", color: "var(--text)", cursor: "pointer", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Saving…" : "Publish"}
          </button>
        </form>
      </div>
    </>
  );
}
