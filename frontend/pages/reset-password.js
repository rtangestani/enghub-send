import { useEffect, useState } from "react";
import { useRouter } from "next/router";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

export default function ResetPassword(){
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const u = router.query.uid ? String(router.query.uid) : "";
    const t = router.query.token ? String(router.query.token) : "";
    setUserId(u); setToken(t);
  }, [router.query.uid, router.query.token]);

  async function submit(e){
    e.preventDefault(); setMsg("");
    const res = await fetch(`${API_BASE}/api/reset-password`, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ userId, token, password })
    });
    const body = await res.json().catch(()=> ({}));
    if (res.ok) { setMsg("Password updated. You can log in now."); }
    else { setMsg(body.error || "Reset failed."); }
  }

  return (
    <div className="container" style={{ padding:"24px 0" }}>
      <div className="card" style={{ maxWidth: 420, margin: "0 auto", padding: 18 }}>
        <h2>Set a new password</h2>
        <form onSubmit={submit}>
          <label>New password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                 style={{ width:"100%", height:38, margin:"6px 0 12px", borderRadius:8, border:"1px solid var(--line)", background:"var(--input-bg)", color:"var(--text)", padding:"0 12px" }}/>
          <button className="inlineLink" type="submit" style={{ border:"1px solid var(--line)", borderRadius:8, padding:"8px 12px" }}>
            Save
          </button>
        </form>
        {msg && <div style={{ marginTop:10 }}>{msg}</div>}
      </div>
    </div>
  );
}
