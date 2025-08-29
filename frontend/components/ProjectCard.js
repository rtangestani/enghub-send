// components/ProjectCard.js
import Link from "next/link";
import { useState } from "react";
import styles from "./ProjectCard.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const abs = (u) => (u && u.startsWith("/uploads") ? `${API_BASE}${u}` : u);
const FALLBACK_IMAGE = "images/default-project.png"; // fallback image in public/images

export default function ProjectCard({ project }) {
  const [likes, setLikes] = useState(project.likes ?? project.likes_count ?? 0);

  const user =
    typeof window !== "undefined"
      ? JSON.parse(localStorage.getItem("enghub:user") || "null")
      : null;

  async function like() {
    if (!user?.username) return alert("Please log in to like projects.");
    try {
      const res = await fetch(`${API_BASE}/api/projects/${project.id}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username, value: 1 }),
      });
      const data = await res.json();
      if (res.ok) setLikes(data.likes_count ?? likes + 1);
    } catch (e) {
      console.error(e);
    }
  }

  const downloads = project.downloads ?? 0;
  const comments = project.comments ?? project.comments_count ?? 0;
  const imageSrc = `${(abs(project.image) || FALLBACK_IMAGE).split("?")[0]}?t=${project.id}`;
  const ownerUsername = project.owner?.username || project.owner_username;
  const ownerAvatar = abs(project.owner?.avatar || "/images/avatar1.png");

  return (
    <div className={styles.card}>
      <Link href={`/projects/${project.id}`} className={styles.thumbLink}>
        <img
          src={imageSrc}
          alt={project.title}
          className={styles.thumb}
          onError={(e) => {
            // if the supplied image fails to load, use the fallback
            e.currentTarget.src = FALLBACK_IMAGE;
          }}
        />
      </Link>

      <div className={styles.body}>
        <Link href={`/projects/${project.id}`} className={styles.title}>
          {project.title}
        </Link>
        <div className={styles.desc}>{project.description}</div>

        {ownerUsername && (
          <div className={styles.ownerRow}>
            <Link href={`/profile/${ownerUsername}`} className={styles.ownerChip}>
              <img
                src={`${(ownerAvatar || "/images/avatar1.png").split("?")[0]}?t=${ownerUsername}`}
                onError={(e)=>{ e.currentTarget.src="/images/avatar1.png"; }}
                alt=""
                className={styles.ownerAvatar}
              />
              <span>@{ownerUsername}</span>
            </Link>
          </div>
        )}

        <div className={styles.meta}>
          <span>📥 {downloads}</span>
          {/* <button className={styles.likeBtn} type="button" onClick={like}> */}
            ❤ {likes} 
          {/*</button>*/}
           <span>💬 {comments}</span> 
        </div>
      </div>
    </div>
  );
}
