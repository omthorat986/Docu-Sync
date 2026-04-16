import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const DOC_TYPE_META = {
  text:  { label: 'Rich Text', icon: '✏️', bg: '#eef2ff', color: '#4f46e5' },
  code:  { label: 'Code',      icon: '💻', bg: '#fef9c3', color: '#854d0e' },
  notes: { label: 'Notes',     icon: '📝', bg: '#f0fdf4', color: '#166534' },
};

function Dashboard({ setToken }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDocType, setNewDocType] = useState('text');
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const navigate = useNavigate();

  const token = localStorage.getItem('docu-sync-token');
  const userId = localStorage.getItem('docu-sync-userId');

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    fetchDocs();
  }, [token, navigate]);

  const fetchDocs = async () => {
    try {
      const res = await fetch('http://localhost:5001/api/docs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch documents');
      setDocs(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = async () => {
    setCreatingDoc(true);
    try {
      const res = await fetch('http://localhost:5001/api/docs/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newDocType }),
      });
      if (!res.ok) throw new Error('Failed to create document');
      const newDoc = await res.json();
      navigate(`/doc/${newDoc.roomId}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setCreatingDoc(false);
      setShowCreateModal(false);
    }
  };

  const handleDelete = async (roomId) => {
    if (!window.confirm('Permanently delete this document?')) return;
    try {
      const res = await fetch(`http://localhost:5001/api/docs/${roomId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      setDocs(docs.filter(d => d.roomId !== roomId));
    } catch (err) { alert(err.message); }
  };

  const startRename = (doc) => {
    setRenamingId(doc.roomId);
    setRenameVal(doc.title || '');
  };

  const commitRename = async (roomId) => {
    const trimmed = renameVal.trim();
    if (!trimmed) { setRenamingId(null); return; }
    try {
      const res = await fetch(`http://localhost:5001/api/docs/${roomId}/rename`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) throw new Error('Rename failed');
      // Optimistic update
      setDocs(docs.map(d => d.roomId === roomId ? { ...d, title: trimmed } : d));
    } catch (err) { alert(err.message); }
    finally { setRenamingId(null); }
  };

  const handleLogout = () => {
    ['docu-sync-token', 'docu-sync-userId', 'docu-sync-userName', 'docu-sync-userColor']
      .forEach(k => localStorage.removeItem(k));
    if (setToken) setToken(null);
    navigate('/login');
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading dashboard…</div>;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800 }}>📄 Your Documents</h1>
          <p style={{ color: '#64748b', margin: '6px 0 0' }}>Manage and collaborate on your shared workspaces.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowCreateModal(true)} className="primary-btn" style={{ minWidth: 160 }}>
            + New Document
          </button>
          <button onClick={handleLogout} className="secondary-btn">Logout</button>
        </div>
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 20 }}>{error}</div>}

      {/* Document list */}
      <div style={{ display: 'grid', gap: 14 }}>
        {docs.length === 0 ? (
          <div className="empty-state" style={{ textAlign: 'center', padding: '60px 20px', fontSize: 16 }}>
            No documents yet. Create your first one!
          </div>
        ) : docs.map(doc => {
          const isOwner = doc.ownerId?._id === userId || doc.ownerId === userId;
          const meta = DOC_TYPE_META[doc.type] || DOC_TYPE_META.text;
          const isRenaming = renamingId === doc.roomId;

          return (
            <div key={doc.roomId} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '18px 20px', background: '#fff', borderRadius: 14,
              border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              transition: 'box-shadow 0.15s ease',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                  {/* Inline rename input or clickable title */}
                  {isRenaming ? (
                    <input
                      value={renameVal}
                      autoFocus
                      onChange={e => setRenameVal(e.target.value)}
                      onBlur={() => commitRename(doc.roomId)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename(doc.roomId);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      style={{
                        fontWeight: 700, fontSize: 16, border: '2px solid #4f46e5',
                        borderRadius: 8, padding: '3px 10px', outline: 'none',
                      }}
                    />
                  ) : (
                    <a
                      href="#"
                      onClick={e => { e.preventDefault(); navigate(`/doc/${doc.roomId}`); }}
                      style={{ color: '#1f2937', textDecoration: 'none', fontWeight: 700, fontSize: 17 }}
                    >
                      {doc.title || 'Untitled Document'}
                    </a>
                  )}

                  {/* Type badge */}
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                    background: meta.bg, color: meta.color,
                  }}>
                    {meta.icon} {meta.label}
                  </span>

                  {/* Role badge */}
                  {isOwner
                    ? <span style={{ fontSize: 11, background: '#eef2ff', color: '#4f46e5', padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>Owner</span>
                    : <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>Collaborator</span>}
                  {doc.isPublic && <span style={{ fontSize: 11, background: '#ecfdf3', color: '#166534', padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>Public</span>}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  Last updated: {new Date(doc.updatedAt).toLocaleString()}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => navigate(`/doc/${doc.roomId}`)} className="primary-btn" style={{ minHeight: 34, fontSize: 13 }}>Open</button>
                {isOwner && <>
                  <button onClick={() => startRename(doc)} className="secondary-btn" style={{ minHeight: 34, fontSize: 13 }}>Rename</button>
                  <button onClick={() => handleDelete(doc.roomId)} className="secondary-btn" style={{ minHeight: 34, fontSize: 13, color: '#dc2626', background: '#fef2f2' }}>Delete</button>
                </>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create document modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
          display: 'grid', placeItems: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 20, padding: 32,
            width: 'min(480px, 90vw)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ margin: '0 0 8px' }}>Create New Document</h2>
            <p style={{ color: '#64748b', marginBottom: 24 }}>Choose a document type to get started.</p>

            <div style={{ display: 'grid', gap: 12, marginBottom: 28 }}>
              {Object.entries(DOC_TYPE_META).map(([type, meta]) => (
                <label key={type} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                  borderRadius: 12, border: `2px solid ${newDocType === type ? '#4f46e5' : '#e5e7eb'}`,
                  background: newDocType === type ? '#eef2ff' : '#fff',
                  cursor: 'pointer', transition: 'all 0.15s ease',
                }}>
                  <input type="radio" name="doctype" value={type}
                    checked={newDocType === type}
                    onChange={() => setNewDocType(type)}
                    style={{ display: 'none' }}
                  />
                  <span style={{ fontSize: 24 }}>{meta.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700 }}>{meta.label}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {type === 'text' && 'Rich text with Bold, Italic, Underline and more'}
                      {type === 'code' && 'Monospace editor for writing and sharing code'}
                      {type === 'notes' && 'Simple plain-text area for quick notes'}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateModal(false)} className="secondary-btn">Cancel</button>
              <button onClick={handleCreateNew} className="primary-btn" disabled={creatingDoc}>
                {creatingDoc ? 'Creating…' : 'Create Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
