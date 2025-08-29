import { useState } from "react";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

export default function ForgotPassword(){
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e){
    e.preventDefault(); setMsg("");
    const res = await fetch(`${API_BASE}/api/forgot-password`, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ email })
    });
    const body = await res.json().catch(()=> ({}));
    setMsg(res.ok ? "If that email exists, a reset link was sent." : (body.error || "Request failed"));
  }

  return (
    <div className="container" style={{ padding:"24px 0" }}>
      <div className="card" style={{ maxWidth: 420, margin: "0 auto", padding: 18 }}>
        <h2>Password reset</h2>
        <form onSubmit={submit}>
          <label>Email</label>
          <input value={email} onChange={e=>setEmail(e.target.value)}
                 type="email" placeholder="you@example.com"
                 style={{ width:"100%", height:38, margin:"6px 0 12px", borderRadius:8, border:"1px solid var(--line)", background:"var(--input-bg)", color:"var(--text)", padding:"0 12px" }}/>
          <button className="inlineLink" type="submit" style={{ border:"1px solid var(--line)", borderRadius:8, padding:"8px 12px" }}>
            Send reset link
          </button>
        </form>
        {msg && <div style={{ marginTop:10 }}>{msg}</div>}
      </div>
    </div>
  );
}
