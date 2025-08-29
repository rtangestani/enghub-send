import styles from './AttachmentList.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function AttachmentList({ attachments }) {
  if (!attachments || attachments.length === 0) return null;

  const user = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('enghub:user') || 'null')
    : null;

  const token = typeof window !== 'undefined'
    ? (localStorage.getItem('enghub:token') || '')
    : '';

  function handleDownload(att) {
    if (!user || !token) {
      alert('Please log in to download files.');
      return;
    }
    window.location.href =
      `${API_BASE}/api/attachments/${att.id}/download?token=${encodeURIComponent(token)}`;
  }

  return (
    <ul className={styles.list}>
      {attachments.map(att => (
        <li key={att.id} className={styles.item}>
          <span>{att.filename}</span>
          <button
            type="button"
            onClick={() => handleDownload(att)}
            className={styles.downloadButton}
          >
            Download
          </button>
        </li>
      ))}
    </ul>
  );
}
