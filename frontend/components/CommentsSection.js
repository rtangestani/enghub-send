import { useState } from "react";
import Link from "next/link";
import styles from "./CommentsSection.module.css";

export default function CommentsSection({ comments: initial = [], allowWrite = false, linkAuthors=false }) {
  const [comments, setComments] = useState(initial);
  const [draft, setDraft] = useState("");

  function add(){
    const text = draft.trim();
    if(!text) return;
    const newC = {
      id: String(Date.now()),
      author: { name: "You", avatar: "/images/avatar1.png" },
      text
    };
    setComments([...comments, newC]);
    setDraft("");
  }

  return (
    <div className={styles.container}>
      <div className={styles.heading}>Comments</div>

      {comments.map(c => (
        <div className={styles.comment} key={c.id}>
          <img 
            className={styles.commentAvatar} 
            src={c.author.avatar} 
            alt={c.author.name}
            onError={(e) => { 
              e.currentTarget.onerror = null; 
              e.currentTarget.src = "/images/avatar1.png"; 
            }}
          />
          <div className={styles.commentBubble}>
            <div className={styles.author}>
              {linkAuthors && c.author.username ? (
                <Link href={`/profile/${c.author.username}`} className="inlineLink">{c.author.name}</Link>
              ) : c.author.name}
            </div>
            <div className={styles.text}>{c.text}</div>
          </div>
        </div>
      ))}

      {allowWrite && (
        <div className={styles.composer}>
          <textarea
            value={draft}
            onChange={(e)=>setDraft(e.target.value)}
            placeholder="Write a comment…"
            className={styles.input}
          />
          <button onClick={add} className={styles.send}>Post</button>
        </div>
      )}
    </div>
  );
}
