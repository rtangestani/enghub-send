// frontend/pages/projects/[id]/graph.js
import { useRouter } from "next/router";
import Link from "next/link";
import PeopleGraph from "../../../components/PeopleGraph";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const dashId = (pid12) => String(pid12 || "").replace(/(\d{3})(?=\d)/g, "$1-");

export default function GraphFull() {
  const router = useRouter();
  const { id } = router.query;
  const pid = String(id || "").replace(/\D/g, ""); // 12 digits

  return (
    <div
      className="container"
      style={{
        padding: "20px 0 32px",
      }}
    >
      <div
        className="card"
        style={{
          padding: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Reference network</h2>
          <Link href={`/projects/${dashId(pid)}`} className="inlineLink">
            ← Back to project
          </Link>
        </div>

        <div
          style={{
            width: "100%",
            maxWidth: 1200,
            margin: "0 auto",
            border: "1px solid var(--line)",
            borderRadius: 12,
            background: "#0b1220",
            padding: 10,
          }}
        >
          {/* Big canvas but still down-only scale inside */}
          <PeopleGraph projectPublicId={pid} maxHeight={600} />
        </div>
      </div>
    </div>
  );
}
