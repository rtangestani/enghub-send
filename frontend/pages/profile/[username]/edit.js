// frontend/pages/profile/[username]/edit.js
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { authHeader } from "../../../lib/auth";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const abs = (url) => (url && url.startsWith("/uploads") ? `${API_BASE}${url}` : url);

// Helper: read JSON if possible, otherwise return text
async function readJsonOrText(res) {
  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  if (ctype.includes("application/json")) return await res.json();
  return await res.text();
}

export default function ProfileEdit() {
  const router = useRouter();
  const { username } = router.query;

  const [me, setMe] = useState(null);
  const [name, setName] = useState("");
  const [skillsStr, setSkillsStr] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("");
  const [contactsStr, setContactsStr] = useState(""); // NEW
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("enghub:user") : null;
    setMe(raw ? JSON.parse(raw) : null);
  }, []);

  const canEdit = useMemo(() => !!me && !!username && me.username === username, [me, username]);

  // Load profile for editing
  
  useEffect(() => {
    if (!username) return;
    (async () => {
      try {
        const safeUser = encodeURIComponent(username);
        const res = await fetch(`${API_BASE}/api/profile/${safeUser}`);
        const data = await readJsonOrText(res);
        if (!res.ok) throw new Error(typeof data === "string" ? data : data?.error || "Failed to load profile");

        const u = data;
        setName(u.name || "");
        const skills = Array.isArray(u.skills) ? u.skills : (u.skills ? JSON.parse(u.skills || "[]") : []);
        setSkillsStr(skills.join(", "));
        setBio(u.bio || "");
        setAvatar(u.avatar || "/images/avatar1.png");
        // Pre-fill contactsStr from u.links
        try {
          const raw = u.links;
          // u.links can be an array (strings or {label,url}) or a JSON string
          const arr = Array.isArray(raw) ? raw : (raw ? JSON.parse(raw) : []);
          const lines = [];
          for (const item of Array.isArray(arr) ? arr : []) {
            if (!item) continue;
            if (typeof item === "string") {
              lines.push(item);
            } else if (typeof item === "object") {
              if (item.url) {
                lines.push(item.label ? `${item.label}: ${item.url}` : item.url);
              } else {
                // object map like { github:"...", linkedin:"..." }
                for (const [label, url] of Object.entries(item)) {
                  if (url) lines.push(label ? `${label}: ${url}` : url);
                }
              }
            }
          }
          setContactsStr(lines.join("\n"));
        } catch {
          setContactsStr("");
        }

        setMsg("");
      } catch (e) {
        setMsg(e.message || "Failed to load profile.");
      }
    })();
  }, [username]);

  // Guard: if trying to edit someone else, bounce to their view page
  useEffect(() => {
    if (me && username && me.username !== username) router.replace(`/profile/${username}`);
  }, [me, username, router]);

  async function save() {
    setMsg("");
    try {
      const safeUser = encodeURIComponent(username);
      const body = {
        name: name.trim(),
        bio,
        avatar,
        skills: skillsStr.split(",").map((s) => s.trim()).filter(Boolean),

        // NEW: turn each line into {label,url} or just {url}
        links: contactsStr
          .split("\n")
          .map((line) => {
            const t = line.trim();
            if (!t) return null;
            const idx = t.indexOf(":");
            if (idx === -1) return { label: "", url: t };
            const label = t.slice(0, idx).trim();
            const url = t.slice(idx + 1).trim();
            if (!url) return null;
            return { label, url };
          })
          .filter(Boolean),
      };



      // BACKEND EXPECTS POST (not PUT)
const res = await fetch(`${API_BASE}/api/profile/${safeUser}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...authHeader() },
  body: JSON.stringify(body),
});

      const data = await readJsonOrText(res);
      if (!res.ok) {
        const snippet = typeof data === "string" ? data.slice(0, 200) : (data?.error || "Save failed");
        throw new Error(snippet);
      }

      const updated = data; // server returns the updated row
      localStorage.setItem(
        "enghub:user",
        JSON.stringify({
          ...(me || {}),
          username,
          name: updated.name,
          avatar: updated.avatar || avatar || "/images/avatar1.png",
        })
      );
      try {
        window.dispatchEvent(new Event("storage"));
      } catch {
        // ignore
      }

      setMsg("Saved.");
    } catch (e) {
      setMsg(e.message || "Request failed");
    }
  }

  async function onAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg("");
    try {
      const safeUser = encodeURIComponent(username);

      // 1) Upload the file (username must be BEFORE the file)
const fd = new FormData();
fd.append("username", me.username);
fd.append("file", file);
const upRes = await fetch(`${API_BASE}/api/upload`, {
  method: "POST",
  headers: { ...authHeader() },      // keep auth for uploads
  body: fd
});


//      const upRes = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: fd });


const upData = await readJsonOrText(upRes);
if (!upRes.ok) {
  const snippet = typeof upData === "string" ? upData.slice(0, 200) : (upData?.error || "Upload failed");
  throw new Error(snippet);
}
const { url } = upData;

      // Preview new avatar immediately
      setAvatar(url);
      // 2) Persist avatar on the profile (BACKEND EXPECTS POST)
const pr = await fetch(`${API_BASE}/api/profile/${safeUser}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...authHeader() },
  body: JSON.stringify({ avatar: url }),
});
      const pBody = await readJsonOrText(pr);
      if (!pr.ok) {
        const snippet = typeof pBody === "string" ? pBody.slice(0, 200) : (pBody?.error || "Failed to save avatar");
        throw new Error(snippet);
      }

      // 3) Sync navbar/localStorage too
      localStorage.setItem("enghub:user", JSON.stringify({ ...(me || {}), username, avatar: url }));
      try {
        window.dispatchEvent(new Event("storage"));
      } catch (err) {
        // Ignore if dispatching fails (e.g. server-side rendering)
      }

      setMsg("Avatar updated.");
    } catch (e) {
      setMsg(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (!canEdit) return null;

  return (
    <div className="container" style={{ padding: "18px 0 36px" }}>
      <div className="pageGrid">
        <aside />
        <main>
          <div
            className="card"
            style={{
              padding: 16,
              display: "grid",
              gap: 16,                         // a bit more breathing room
              maxWidth: 640,
              boxShadow: "0 1px 2px rgba(0,0,0,.08)", // subtle depth
              borderRadius: 12                  // slightly softer corners (optional)
            }}
          >
            <h3 style={{ margin: 0 }}>Edit profile</h3>

            {/* avatar row */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img
                src={`${abs(avatar) || "/images/avatar1.png"}?t=${Date.now()}`}
                alt=""
                width={72}
                height={72}
                onError={(e) => {
                  // Prevent infinite loop if the placeholder is missing
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "/images/avatar1.png";
                }}
                style={{ borderRadius: "50%", border: "1px solid var(--line)" }}
              />
              <label className="inlineLink" style={{ cursor: "pointer" }}>
                <input type="file" accept="image/*" onChange={onAvatarChange} style={{ display: "none" }} />
                {uploading ? "Uploading…" : "Change avatar"}
              </label>
            </div>

            {/* Name */}
            <div>
              <label style={{ fontWeight: 600 }}>Display name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your display name"
                style={{
                  width: "100%",
                  height: 38,
                  margin: "6px 0 12px",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: "var(--input-bg)",
                  color: "var(--text)",
                  padding: "0 12px",
                }}
              />
            </div>

            {/* Skills */}
            <div>
              <label style={{ fontWeight: 600 }}>Skills (comma-separated)</label>
              <input
                type="text"
                value={skillsStr}
                onChange={(e) => setSkillsStr(e.target.value)}
                placeholder="e.g. CFD, CAD, Python"
                style={{
                  width: "100%",
                  height: 38,
                  margin: "6px 0 12px",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: "var(--input-bg)",
                  color: "var(--text)",
                  padding: "0 12px",
                }}
              />
            </div>

            {/* Contacts / Links */}
            <div>
              <label style={{ fontWeight: 600 }}>Links (one per line)</label>
              <textarea
                value={contactsStr}
                onChange={(e) => setContactsStr(e.target.value)}
                placeholder={"GitHub: https://github.com/yourname\nLinkedIn: https://linkedin.com/in/yourname"}
                style={{
                  width: "100%",
                  minHeight: 72,
                  margin: "6px 0 12px",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: "var(--input-bg)",
                  color: "var(--text)",
                  padding: 10,
                  resize: "vertical",
                }}
              />
            </div>

            {/* Bio */}
            <div>
              <label style={{ fontWeight: 600 }}>Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us about yourself"
                style={{
                  width: "100%",
                  minHeight: 96,
                  margin: "6px 0 12px",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: "var(--input-bg)",
                  color: "var(--text)",
                  padding: 10,
                  resize: "vertical",
                }}
              />
            </div>

            {/* Save */}
            <div>
              <button
                onClick={save}
                className="inlineLink"
                style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}
              >
                Save profile
              </button>
            </div>

            {/* Message */}
            {msg && (
              <div
                style={{
                  color: msg === "Saved." || msg === "Avatar updated." ? "var(--success)" : "#ffb4b4",
                }}
              >
                {msg}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
