// frontend/pages/projects/[id]/edit.js
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { authHeader } from "../../../lib/auth"; // adjust path if needed

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const abs = (u) => (u && u.startsWith("/uploads") ? `${API_BASE}${u}` : u);
const dashId = (pid12) => String(pid12 || '').replace(/(\d{3})(?=\d)/g, '$1-');
export default function EditProject() {
  const router = useRouter();
  const { id } = router.query;

  const me = typeof window !== "undefined"
    ? JSON.parse(localStorage.getItem("enghub:user") || "null")
    : null;

  const [project, setProject] = useState(null);

  // form state
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [longDesc, setLongDesc] = useState("");
  const [image, setImage] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // references state
  const [references, setReferences] = useState([]);
  const [refDesc, setRefDesc] = useState("");
  const [refUrl, setRefUrl] = useState("");
  const [refProjectId, setRefProjectId] = useState("");
// Add right after refProjectId state
  const idDigits = (refProjectId || "").replace(/[^\d]/g, "");
  const hideUrl = idDigits.length === 12;

// If it’s an internal ID, clear URL automatically so you don’t accidentally send both
async function loadProject() {
  const res = await fetch(`${API_BASE}/api/projects/${id}`);
  const p = await res.json().catch(() => ({}));
  if (!res.ok || p?.error) { setMsg(p?.error || "Failed to load"); return; }

  setProject(p);
  setTitle(p?.title || "");
  setDesc(p?.description || "");
  setLongDesc(p?.long_description || p?.longDescription || "");
  setImage(p?.image || "");

  // seed references list
  const to = Array.isArray(p.references_to) ? p.references_to : [];
  setReferences(
    to.map(r => ({
      desc: r.ref_desc || (r.dst_title ? `Project: ${r.dst_title}` : ""),
      url:  r.ref_url || (r.dst_public_id ? `${location.origin}/projects/${dashId(r.dst_public_id)}` : ""),
      projectId: r.dst_public_id ? dashId(r.dst_public_id) : ""
    }))
  );
}

useEffect(() => { if (id) loadProject(); }, [id]);

//useEffect(() => {
 // if (hideUrl && refUrl) setRefUrl("");
//}, [hideUrl, refUrl]);



  const cacheBust = useMemo(() => Date.now(), [image]);
  const canEdit = useMemo(
    () => !!me && !!project && me.username === project.owner_username,
    [me, project]
  );

  // load project
  useEffect(() => {
    if (!id) return;
    (async () => {
      const p = await fetch(`${API_BASE}/api/projects/${id}`).then(r => r.json());
      if (p?.error) { setMsg(p.error); return; }
      setProject(p);
      setTitle(p?.title || "");
      setDesc(p?.description || "");
      setLongDesc(p?.long_description || p?.longDescription || "");
      setImage(p?.image || "");

      // seed references editor from project references_to
// seed references editor from project references_to
// seed references editor from project references_to
const to = Array.isArray(p.references_to) ? p.references_to : [];
setReferences(
  to.map(r => ({
    desc: r.ref_desc || (r.dst_title ? `Project: ${r.dst_title}` : ""),
    // if it's an internal ref we can build the URL from public_id
    url:  r.ref_url || (r.dst_public_id ? `${location.origin}/projects/${dashId(r.dst_public_id)}` : ""),
    // show dashed id in the input for convenience
    projectId: r.dst_public_id ? dashId(r.dst_public_id) : ""
  }))
);



    })();
  }, [id]);

  // guard non-owner
  useEffect(() => {
    if (project && me && me.username !== project.owner_username) {
      router.replace(`/projects/${id}`);
    }
  }, [project, me, id, router]);

  // cover upload
  async function uploadCover(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !me?.username) return;
    setMsg("");
    try {
const fd = new FormData();
fd.append("username", me.username);
fd.append("projectId", String(id || "").replace(/\D/g, ""));
fd.append("file", file);

const res = await fetch(`${API_BASE}/api/upload`, {
  method: "POST",
  headers: authHeader(),       // ok to pass just this with FormData
  body: fd                     // ✅ send fd
});
const data = await res.json().catch(() => ({}));
if (!res.ok || !data?.url) throw new Error(data?.error || "Upload failed");

setImage(data.url);
setProject(p => (p ? { ...p, image: data.url } : p));

// persist the image on the project (one request, with auth)
const saveRes = await fetch(`${API_BASE}/api/projects/${id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", ...authHeader() },
  body: JSON.stringify({ image: data.url }),
});
const saveBody = await saveRes.json().catch(() => ({}));
if (!saveRes.ok) throw new Error(saveBody?.error || "Failed to update project image");

setMsg("Cover image uploaded.");

    } catch (e) {
      setMsg(e.message || "Upload failed");
    }
  }
// NEW: attachments uploader
const [uploadingFiles, setUploadingFiles] = useState(false);

async function uploadAttachments(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = "";
  if (!files.length || !me?.username) return;

  setMsg(""); setUploadingFiles(true);
  try {
    const code = String(id || "").replace(/\D/g, ""); // 12 digits from route
    for (const f of files) {
      const fd = new FormData();
      fd.append("username", me.username);
      fd.append("projectId", code);
      fd.append("file", f);
      const r = await fetch(`${API_BASE}/api/upload`, {
  method: "POST",
  headers: { ...authHeader() },
  body: fd
});

      const body = await r.json().catch(()=> ({}));
      if (!r.ok) throw new Error(body?.error || "Upload failed");
    }
setMsg("Files uploaded.");
await loadProject();   // ✅ this re-renders with the new files
{/* Existing files */}
{/*

<div style={{ marginTop: 10 }}>
  <div style={{ fontWeight: 600, marginBottom: 6 }}>Existing files</div>

  {!project?.attachments?.length ? (
    <div style={{ fontSize: 13, opacity: 0.7 }}>No files yet.</div>
  ) : (
    <ul style={{ listStyle: "none", paddingLeft: 0 }}>
      {project.attachments.map((att) => (
        <li key={att.id}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #eee" }}>
          <a
            href={`${API_BASE}${att.download_url}`}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "none" }}
          >
            {att.filename}
          </a>
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            {Math.round((att.size || 0) / 1024)} KB
          </span>

          <button
            type="button"
            onClick={() => removeAttachment(att.id)}
            style={{ marginLeft: "auto" }}
            className="btn btn-danger"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  )}
</div>

*/}

    // optional refresh so attachments appear on the project page immediately
    try {
      const p = await fetch(`${API_BASE}/api/projects/${id}`).then(r=>r.json());
      if (p?.error) throw new Error(p.error);
      setProject(p);
    } catch (_) {}
  } catch (e) {
    setMsg(e.message || "Upload failed");
  } finally {
    setUploadingFiles(false);
  }
}


  function removeReference(i) {
    setReferences((prev) => prev.filter((_, idx) => idx !== i));
  }

   async function save() {
    setSaving(true);
    setMsg("");
    try {
      // NEW: normalize references before sending
      const payloadRefs = (references || []).map(r => {
        const desc = String(r.desc || "").trim();
        const url  = String(r.url  || "").trim();
        // strip all non-digits from projectId
        const rawId = String(r.projectId || "").replace(/[^\d]/g, "");
        if (rawId.length === 12) {
          // INTERNAL: send ONLY the ID (no URL)
          return { desc, projectId: rawId };
        }
        // EXTERNAL: need a URL
        if (url) return { desc, url };
        // otherwise skip this row
        return null;
      }).filter(Boolean);

const res = await fetch(`${API_BASE}/api/projects/${id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", ...authHeader() },
  body: JSON.stringify({
    ownerUsername: me.username,
    title,
    description: desc,
    longDescription: longDesc,
    image: image || null,
    references: payloadRefs
  }),
});

      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Save failed");
      setMsg("Saved.");
      router.push(`/projects/${id}?t=${Date.now()}`);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  }

async function handleDelete() {
  if (!project || !me?.username) return;
  if (!confirm("Delete this project? This cannot be undone.")) return;

  try {
    const token = localStorage.getItem("enghub:token");
    if (!token) { alert("Please log in."); return; }

    // Use the route's public_id, but strip dashes/spaces for the API
    const code = String(id || "").replace(/\D/g, "");  // <-- 12 digits
    const res = await fetch(`${API_BASE}/api/projects/${code}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || "Delete failed");

    // Back to your profile after delete
    router.replace(`/profile/${me.username}`);
  } catch (e) {
    alert(e.message || "Delete failed");
  }
}

async function removeAttachment(attId) {
  if (!confirm("Remove this file?")) return;
  const r = await fetch(`${API_BASE}/api/attachments/${attId}`, {
    method: "DELETE",
    headers: authHeader()
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    alert(body?.error || "Delete failed");
    return;
  }
  // simplest: re-fetch the whole project
  await loadProject();
}



function addReference() {
  const d = refDesc.trim();
  const u = refUrl.trim();
  const pid = refProjectId.trim();
  if (!d || (!u && !pid)) return;

  const digits = pid.replace(/[^\d]/g, "");
  if (digits.length === 12) {
    // internal: DO NOT keep URL
    setReferences(prev => [...prev, { desc: d, url: "", projectId: pid }]);
  } else {
    // external: needs URL
    setReferences(prev => [...prev, { desc: d, url: u, projectId: "" }]);
  }
  setRefDesc(""); setRefUrl(""); setRefProjectId("");
}


  if (!project) return null;

  return (
    <div className="container" style={{ padding: "18px 0 36px" }}>
      <div className="card" style={{ maxWidth: 720, margin: "0 auto", padding: 18, display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Edit project</h2>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src={`${((abs(image) || "/images/placeholder.png")).split("?")[0]}?t=${cacheBust}`}
            onError={(e) => { e.currentTarget.src = "/images/placeholder.png"; }}
            alt=""
            width={160}
            height={100}
            style={{ objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }}
          />
          <label className="inlineLink" style={{ cursor: "pointer", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px" }}>
            Change cover
  <input type="file" accept="image/*" onChange={uploadCover} style={{ display: "none" }} />
</label>
</div>

{/* NEW: add attachments */}
<div style={{ marginTop: 8 }}>
  <label style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
    Add files (attachments)
  </label>
  <input type="file" multiple onChange={uploadAttachments} />
  {uploadingFiles && <div style={{ fontSize: 12, color: "var(--muted)" }}>Uploading…</div>}
</div>
{/* Existing files */}
<div style={{ marginTop: 10 }}>
  <div style={{ fontWeight: 600, marginBottom: 6 }}>Existing files</div>

  {!project?.attachments?.length ? (
    <div style={{ fontSize: 13, opacity: 0.7 }}>No files yet.</div>
  ) : (
    <ul style={{ listStyle: "none", paddingLeft: 0 }}>
      {project.attachments.map((att) => (
        <li key={att.id}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #eee" }}>
          <a
            href={`${API_BASE}${att.download_url}`}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "none" }}
          >
            {att.filename}
          </a>
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            {Math.round((att.size || 0) / 1024)} KB
          </span>

          <button
            type="button"
            onClick={() => removeAttachment(att.id)}
            style={{ marginLeft: "auto" }}
            className="inlineLink"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  )}
</div>

        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
               style={{ width: "100%", height: 38, borderRadius: 8, border: "1px solid var(--line)", background: "var(--input-bg)", color: "var(--text)", padding: "0 12px" }}/>

        <label>Short description</label>
        <input value={desc} onChange={(e) => setDesc(e.target.value)}
               style={{ width: "100%", height: 38, borderRadius: 8, border: "1px solid var(--line)", background: "var(--input-bg)", color: "var(--text)", padding: "0 12px" }}/>

        <label>Detailed description</label>
        <textarea value={longDesc} onChange={(e) => setLongDesc(e.target.value)}
                  style={{ minHeight: 140, borderRadius: 8, border: "1px solid var(--line)", background: "var(--input-bg)", color: "var(--text)", padding: 10 }}/>

        <h3 style={{ marginTop: 10 }}>References</h3>
        {references.map((r, i) => (
          <div key={i} style={{ border:"1px solid var(--line)", borderRadius:8, padding:8, marginBottom:8 }}>
            <div style={{ fontWeight:600 }}>{r.desc}</div>
            {r.url && <div style={{ fontSize:12, color:"var(--muted)" }}>{r.url}</div>}
            {r.projectId && <div style={{ fontSize:12, color:"var(--muted)" }}>Project ID: {r.projectId}</div>}
            <button type="button" onClick={()=>removeReference(i)} className="inlineLink" style={{ marginTop:6, borderRadius: 8 }}>Remove</button>
          </div>
        ))}

        {/*<div style={{ display:"grid", gap:8 }}>
          <input placeholder="Reference description" value={refDesc} onChange={e=>setRefDesc(e.target.value)} />
          <input placeholder="URL (optional)" value={refUrl} onChange={e=>setRefUrl(e.target.value)} />
          <input placeholder="EngHub Project ID (optional)" value={refProjectId} onChange={e=>setRefProjectId(e.target.value)} />
          <button type="button" onClick={addReference} className="inlineLink" style={{ border:"1px solid var(--line)", borderRadius:8, padding:"8px 12px" }}>Add reference</button>
        </div>*/}
<div style={{ display: "grid", gap: 6, gridTemplateColumns: "2fr 1.3fr 1fr" }}>
  <input
    type="text"
    placeholder="Description"
    value={refDesc}
    onChange={(e) => setRefDesc(e.target.value)}
  />
  {hideUrl ? (
    // Hide URL when a 12-digit project ID is detected
    <div style={{ fontSize: 12, color: "#8aa" }}>
      Internal link via Project&nbsp;ID — URL not needed
    </div>
  ) : (
    <input
      type="url"
      placeholder="External URL"
      value={refUrl}
      onChange={(e) => setRefUrl(e.target.value)}
    />
  )}
  <input
    type="text"
    placeholder="Project ID (e.g., 123-456-789-012)"
    value={refProjectId}
    onChange={(e) => setRefProjectId(e.target.value)}
  />
</div>
<button type="button" onClick={addReference}style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", background: "var(--publish-btn-bg)" }}>Add</button>


        {msg && <div style={{ color: msg === "Saved." ? "var(--text)" : "#ff6b6b" }}>{msg}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={!canEdit || saving} className="inlineLink"
                  style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", background: "var(--publish-btn-bg)" }}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={() => router.push(`/projects/${id}`)} className="inlineLink"
                  style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", background: "var(--publish-btn-bg)" }}>
            Cancel
          </button>
{canEdit && (
  <button
    type="button"
    onClick={handleDelete}
    className="inlineLink"
    style={{ padding: "8px 12px", borderRadius: 8, color: "#e33", borderColor: "#e33" }}
  >
    Delete project
  </button>
)}


        </div>
      </div>
    </div>
  );
}
