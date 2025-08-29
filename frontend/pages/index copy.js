// frontend/pages/index.js
import { useEffect, useState } from "react";
import Link from "next/link";
import HeroBar from "../components/HeroBar";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const dashId = (pid12) => String(pid12 || '').replace(/(\d{3})(?=\d)/g, '$1-');

export default function Home() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/projects?limit=6`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setItems(data);
        else setErr("Failed to load projects");
      })
      .catch((e) => setErr(e.message || "Failed to load"));
  }, []);

  return (
    <>


      <div style={{ padding: "240px 0 0" }}>
        <HeroBar />
      </div> 


      <div className="container" style={{ padding: "18px 0 36px" }}>
        <h2 style={{ textAlign: "center", margin: "24px 0" }}>Our top picks</h2>

        {err && <div className="card" style={{ maxWidth: 640, margin: "0 auto 12px", padding: 12, color: "#ffb4b4" }}>{err}</div>}

        <div style={{ display: "grid", gap: 16 }}>
          {items.length === 0 && (
            <div className="card" style={{ maxWidth: 640, margin: "0 auto", padding: 16, color: "var(--muted)" }}>
              No projects yet. <Link href="/upload" className="inlineLink">Create one</Link>.
            </div>
          )}

          {items.map((p) => (
            <Link key={p.id} href={`/projects/${dashId(p.public_id)}`} className="card" style={{ display: "flex", gap: 16, padding: 12, alignItems: "center" }}>
              <img
                src={p.image || "images/default-project.png"}
                alt=""
                width={140}
                height={90}
                style={{ objectFit: "cover", borderRadius: 8 }}
                onError={(e) => {
                  e.currentTarget.src = "images/default-project.png";
                }} 
              />
              <div>
                <div style={{ fontWeight: 700 }}>{p.title}</div>
                <div style={{ color: "var(--muted)" }}>{p.description}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
