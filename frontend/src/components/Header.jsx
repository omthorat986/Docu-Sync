import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

function Header({
  activeUsers,
  currentUser,
  onSaveSnapshot,
  savingSnapshot,
  autoSaveMessage,
  roomId,
  documentMeta,
  onTitleChange,
  onVisibilityChange,
  onOpenAnalytics,
}) {
  const [copied, setCopied] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const titleInputRef = useRef(null);
  const navigate = useNavigate();

  const token = localStorage.getItem('docu-sync-token');
  const userId = localStorage.getItem('docu-sync-userId');
  const isOwner = documentMeta?.ownerId === userId;
  const isPublic = documentMeta?.isPublic ?? false;
  const title = documentMeta?.title || 'Untitled Document';

  const handleCopyLink = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(`${window.location.origin}/doc/${roomId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleVisibility = async () => {
    if (!isOwner) return;
    try {
      const res = await fetch(`http://localhost:5001/api/docs/${roomId}/visibility`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isPublic: !isPublic }),
      });
      if (res.ok) {
        if (onVisibilityChange) onVisibilityChange(!isPublic);
      } else { const e = await res.json(); alert(e.error || 'Toggle failed'); }
    } catch { alert('Failed to toggle visibility'); }
  };

  const handleAddCollaborator = async () => {
    if (!isOwner) return;
    const email = window.prompt("Enter the exact email address of the collaborator:");
    if (!email || !email.trim()) return;

    try {
      const res = await fetch(`http://localhost:5001/api/docs/add-collaborator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roomId, email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        alert("Collaborator dynamically added!");
      } else {
        alert(data.error || 'Failed to add collaborator. Are you sure they have an account?');
      }
    } catch {
      alert('Network error while adding collaborator');
    }
  };

  const startTitleEdit = () => {
    if (!isOwner) return;
    setTitleDraft(title);
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.select(), 50);
  };

  const commitTitleEdit = useCallback(async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === title) { setEditingTitle(false); return; }
    setSavingTitle(true);
    try {
      const res = await fetch(`http://localhost:5001/api/docs/${roomId}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: trimmed }),
      });
      if (res.ok) {
        if (onTitleChange) onTitleChange(trimmed);
      } else {
        const e = await res.json();
        alert(e.error || 'Rename failed');
      }
    } catch { alert('Rename failed'); }
    finally { setSavingTitle(false); setEditingTitle(false); }
  }, [titleDraft, title, roomId, token, onTitleChange]);

  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
        {/* Back arrow */}
        <button
          onClick={() => navigate('/dashboard')}
          className="secondary-btn"
          style={{ minHeight: '32px', fontSize: '18px', padding: '0 10px', flexShrink: 0 }}
          title="Back to Dashboard"
        >
          ←
        </button>

        {/* Editable title */}
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitleEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitleEdit();
              if (e.key === 'Escape') setEditingTitle(false);
            }}
            style={{
              fontWeight: 700, fontSize: '20px', border: '2px solid #4f46e5',
              borderRadius: '8px', padding: '4px 10px', outline: 'none', minWidth: '200px',
            }}
            disabled={savingTitle}
          />
        ) : (
          <h2
            onClick={startTitleEdit}
            title={isOwner ? 'Click to rename' : ''}
            style={{
              margin: 0, fontSize: '20px', fontWeight: 700,
              cursor: isOwner ? 'text' : 'default',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {title}
          </h2>
        )}

        {/* Share actions */}
        {roomId && (
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button onClick={handleCopyLink} className="secondary-btn" style={{ minHeight: '30px', fontSize: '12px' }}>
              {copied ? '✓ Copied!' : '📋 Copy Link'}
            </button>
            {isOwner && (
              <>
                <button
                  onClick={handleAddCollaborator}
                  className="secondary-btn"
                  style={{ minHeight: '30px', fontSize: '12px' }}
                >
                  🤝 Add Collaborator
                </button>
                <button
                  onClick={toggleVisibility}
                  className="secondary-btn"
                  style={{
                    minHeight: '30px', fontSize: '12px',
                    background: isPublic ? '#ecfdf3' : '#fef2f2',
                    color: isPublic ? '#166534' : '#991b1b',
                  }}
                >
                  {isPublic ? '🌎 Public' : '🔒 Private'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="topbar-right">
        <button 
          className="secondary-btn" 
          onClick={onOpenAnalytics}
          style={{ minHeight: '30px', fontSize: '12px' }}
        >
          📊 Analytics
        </button>

        <div className="header-pill auto-pill">{autoSaveMessage}</div>

        <div className="user-badges">
          {activeUsers && activeUsers.map((user) => (
            <span className="user-badge" key={user.socketId} style={{ borderColor: user.color }}>
              <span className="user-badge-dot" style={{ backgroundColor: user.color }} />
              {user.userName}
            </span>
          ))}
        </div>

        <div className="current-user-pill">You: <strong>{currentUser.userName}</strong></div>

        <div style={{ position: 'relative', display: 'flex' }}>
          <button className="primary-btn" onClick={() => onSaveSnapshot('')} disabled={savingSnapshot} style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
            {savingSnapshot ? 'Saving...' : 'Save Snapshot'}
          </button>
          <button 
            className="primary-btn" 
            style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: '1px solid rgba(255,255,255,0.2)', padding: '0 8px' }}
            onClick={() => {
              const tag = window.prompt("Enter a tag for this version (e.g. v1.0, Final Review):");
              if (tag !== null) {
                onSaveSnapshot(tag.trim());
              }
            }}
            title="Save with Tag"
            disabled={savingSnapshot}
          >
            🏷
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;