// frontend/pages/explore.js
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import SidebarFilters from "../components/SidebarFilters";
import ProjectCard from "../components/ProjectCard";
import ExpertsSidebar from "../components/ExpertsSidebar";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const CATEGORIES = ["Mechanical","Electrical","Civil","Aerospace","Chemical","Materials","Other"];
const DATA_TYPES = ["Publications","CAD Models","Images","Videos","Datasets","Simulation Files","Reports","Code","Notebooks","3D Scenes"];

export default function Explore(){
  const router = useRouter();
  const q = (router.query.q || "").toString().toLowerCase();
  const [selected, setSelected] = useState([]);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [experts, setExperts] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/projects`)
      .then(r => r.json())
      .then(setProjects)
      .catch(console.error);
  }, []);

  const filtered = useMemo(() => (
    projects.filter(p => {
      const mq = !q || p.title.toLowerCase().includes(q) || (p.description||"").toLowerCase().includes(q);

      const cats = Array.isArray(p.category) ? p.category : (p.category ? JSON.parse(p.category) : []);
      const mc = selected.length === 0 || selected.some(s => (cats||[]).includes(s));

      const tRaw =
        Array.isArray(p.file_types) ? p.file_types :
        Array.isArray(p.types) ? p.types :
        (p.file_types || p.types ? JSON.parse(p.file_types || p.types) : []);
      const mt = selectedTypes.length === 0 || selectedTypes.some(t => (tRaw||[]).includes(t));

      return mq && mc && mt;
    })
  ), [q, selected, selectedTypes, projects]);

  // Build experts list from filtered projects (top 6 owners)
  useEffect(() => {
    const owners = Array.from(new Set(filtered.map(p => p.owner_username))).slice(0, 6);
    Promise.all(owners.map(u =>
      fetch(`${API_BASE}/api/profile/${u}`).then(r => r.json()).catch(()=>null)
    )).then(list => setExperts(list.filter(Boolean)));
  }, [filtered]); // re-run whenever filters/search change

  return (
    <>
      <div className="container" style={{ padding:"36px 0 36px" }}>
        <div className="pageGrid">
          {/* LEFT SIDEBAR */}
          <aside>
            <div className="card" style={{padding:12, marginBottom:12}}>
              <h3 style={{textAlign:"center",marginBottom:8}}>Categories</h3>
              <SidebarFilters categories={CATEGORIES} selectedCategories={selected} onChange={setSelected}/>
            </div>

            <div className="card" style={{padding:12}}>
              <h3 style={{textAlign:"center",marginBottom:8}}>Data types</h3>
              {DATA_TYPES.map(t => (
                <label key={t} style={{ display:"flex", alignItems:"center", gap:8, margin:"6px 0" }}>
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(t)}
                    onChange={() => setSelectedTypes(prev => prev.includes(t) ? prev.filter(x=>x!==t) : [...prev, t])}
                  />
                  {t}
                </label>
              ))}
            </div>
          </aside>

          {/* MAIN */}
          <main style={{display:"grid",gap:16}}>
            {filtered.map(p => (
              <ProjectCard
                key={p.public_id}
                project={{
                  id: p.public_id,
                  title: p.title,
                  description: p.description,
                  image: p.image || "images/default-project.png",
                  downloads: p.downloads || 0,
                  likes: p.likes_count || 0,
                  comments: p.comments_count || 0,
                  owner: { username: p.owner_username },
                }}
              />
            ))}

            {filtered.length === 0 && (
              <div className="card" style={{padding:16,color:"var(--muted)"}}>
                No results. Try different keywords or filters.
              </div>
            )}
          </main>

          {/* RIGHT SIDEBAR */}
          <aside className="hideOnMobile">
            <ExpertsSidebar people={experts} />
          </aside>
        </div>
      </div>
    </>
  );
}
