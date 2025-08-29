// frontend/pages/login.js
import { useState } from "react";
import { useRouter } from "next/router";
import { setAuth } from "../lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

export default function Login() {
  const router = useRouter();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState(""); // for signup
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setMsg(""); setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usernameOrEmail, password }),
      });
      const data = await res.json();
      if (!res.ok || !data?.token || !data?.user) {
        throw new Error(data?.error || "Login failed");
      }
      setAuth(data.token, data.user);
      router.push("/explore");
    } catch (err) {
      setMsg(err.message);
    } finally { setLoading(false); }
  }

  async function handleSignup() {
    setMsg(""); setLoading(true);
    try {
      const username = usernameOrEmail.trim();
      if (!username || !email.trim() || !password) {
        throw new Error("username, email and password are required");
      }
      const res = await fetch(`${API_BASE}/api/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, name: username, email }),
      });
      const data = await res.json();
      if (!res.ok || !data?.token || !data?.user) {
        throw new Error(data?.error || "Signup failed");
      }

      // existing auth handling
      setAuth(data.token, data.user);

      // NEW: after successful signup, save lightweight user for navbar and go to Edit Profile
      const u = data.user;
      localStorage.setItem(
        "enghub:user",
        JSON.stringify({
          username: u.username,
          name: u.name,
          avatar: u.avatar || "/images/avatar1.png",
        })
      );
      router.push(`/profile/${u.username}/edit`);
    } catch (err) {
      setMsg(err.message);
    } finally { setLoading(false); }
  }

  return (
    <div className="container" style={{ padding: "0 0 36px" }}>
      <div className="card" style={{ maxWidth: 480, margin: "24px auto", padding: 18 }}>
        <h2 style={{ marginBottom: 8 }}>Log in</h2>
        <form onSubmit={handleLogin}>
          <label>Username or Email</label>
          <input
            value={usernameOrEmail}
            onChange={(e) => setUsernameOrEmail(e.target.value)}
            style={{ width:"100%", height:38, margin:"6px 0 12px", borderRadius:8, border:"1px solid var(--line)", background:"var(--input-bg)", color:"var(--text)", padding:"0 12px" }}
          />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width:"100%", height:38, margin:"6px 0 12px", borderRadius:8, border:"1px solid var(--line)", background:"var(--input-bg)", color:"var(--text)", padding:"0 12px" }}
          />

          {msg && <div style={{ color:"#ffb4b4", marginBottom:10, fontSize:14 }}>{msg}</div>}

          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            <button
              type="submit"
              disabled={loading}
              className="inlineLink"
              style={{ border:"1px solid var(--line)", borderRadius:8, padding:"8px 12px", background:"var(--panel)", color:"var(--text)", cursor:"pointer", opacity:loading?0.7:1 }}
            >
              {loading ? "Please wait…" : "Log in"}
            </button>

            <button
              type="button"
              onClick={handleSignup}
              disabled={loading}
              style={{ border:"1px solid var(--line)", borderRadius:8, padding:"8px 12px", background:"transparent", color:"var(--text)", cursor:"pointer", opacity:loading?0.7:1 }}
              title="Requires email below"
            >
              Create account
            </button>

            <a href="/forgot-password" className="inlineLink" style={{ alignSelf:"center" }}>
              Forgot password?
            </a>
          </div>

          <div style={{ marginTop:12 }}>
            <label>Email (for signup)</label>
            <input
              type="email"
              value={email}
              onChange={(e)=>setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ width:"100%", height:38, margin:"6px 0 12px", borderRadius:8, border:"1px solid var(--line)", background:"var(--input-bg)", color:"var(--text)", padding:"0 12px" }}
            />
          </div>

          <div style={{ marginTop: 14, display:"grid", gap:8 }}>
            <div style={{ opacity:.8, fontSize:14 }}>Or continue with</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              <a className="inlineLink" href={`${API_BASE}/api/auth/google`}>Google</a>
              <a className="inlineLink" href={`${API_BASE}/api/auth/github`}>GitHub</a>
              <a className="inlineLink" href={`${API_BASE}/api/auth/linkedin`}>LinkedIn</a>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
