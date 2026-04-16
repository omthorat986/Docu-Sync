import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import EditorPanel from '../components/EditorPanel';
import Sidebar from '../components/Sidebar';
import DiffViewer from '../components/DiffViewer';
import ReplayViewer from '../components/ReplayViewer';
import { useSocket } from '../hooks/useSocket';
import { useDocument } from '../hooks/useDocument';
import { useAutosave } from '../hooks/useAutosave';

const SOCKET_URL = 'http://localhost:5001';

function DocumentView() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const token    = localStorage.getItem('docu-sync-token');
  const userId   = localStorage.getItem('docu-sync-userId');
  const userName = localStorage.getItem('docu-sync-userName');
  const userColor = localStorage.getItem('docu-sync-userColor');

  useEffect(() => {
    if (!token) navigate('/login', { state: { from: `/doc/${roomId}` } });
  }, [token, navigate, roomId]);

  const currentUser = useMemo(() => ({ userName, color: userColor }), [userName, userColor]);
  const API_URL = `http://localhost:5001/api/document/${roomId}`;

  const socket = useSocket(SOCKET_URL, !!token, roomId, userName, userColor, userId, token);

  useEffect(() => {
    if (!socket) return;
    socket.on('join-error', (data) => {
      alert(data.error || 'Access Denied');
      navigate('/dashboard');
    });
    return () => socket.off('join-error');
  }, [socket, navigate]);

  const {
    documentMeta,
    content,
    snapshots,
    activityLogs,
    activeUsers,
    lastEditedBy,
    remoteCursors,
    updateContent,
    sendCursorMove,
    lastSnapshotContentRef,
  } = useDocument(socket, roomId, userName, userColor, token);

  // Allow Header to optimistically update the title in meta without a full reload
  const [localTitle, setLocalTitle] = useState(null);
  const effectiveMeta = localTitle
    ? { ...documentMeta, title: localTitle }
    : documentMeta;

  const { saveSnapshot, savingSnapshot, autoSaveMessage } = useAutosave(
    API_URL, content, roomId, userName, userColor, lastSnapshotContentRef, token
  );

  const [restoringSnapshotId, setRestoringSnapshotId] = useState('');
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [replayOpen, setReplayOpen] = useState(false);

  const handleManualSnapshot = async () => saveSnapshot(content, 'manual');

  const handleRestoreSnapshot = async (snapshotId) => {
    try {
      setRestoringSnapshotId(snapshotId);
      const res = await fetch(`${API_URL}/restore/${snapshotId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restoredBy: userName, restoredByColor: userColor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to restore snapshot');
      setSelectedSnapshot(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setRestoringSnapshotId('');
    }
  };

  if (!token) return null;

  return (
    <div className="app-shell">
      <Header
        activeUsers={activeUsers}
        currentUser={currentUser}
        onSaveSnapshot={handleManualSnapshot}
        savingSnapshot={savingSnapshot}
        autoSaveMessage={autoSaveMessage}
        roomId={roomId}
        documentMeta={effectiveMeta}
        onTitleChange={setLocalTitle}
      />

      <div className="main-layout">
        <EditorPanel
          content={content}
          onChange={updateContent}
          lastEditedBy={lastEditedBy}
          remoteCursors={remoteCursors}
          sendCursorMove={sendCursorMove}
          docType={documentMeta?.type || 'text'}
          docTitle={effectiveMeta?.title || 'Document'}
          socket={socket}
          roomId={roomId}
          userName={userName}
          userColor={userColor}
        />

        <Sidebar
          snapshots={snapshots}
          activityLogs={activityLogs}
          onRestoreSnapshot={handleRestoreSnapshot}
          restoringSnapshotId={restoringSnapshotId}
          setSelectedSnapshot={setSelectedSnapshot}
          selectedSnapshot={selectedSnapshot}
          onOpenReplay={() => setReplayOpen(true)}
        />
      </div>

      {selectedSnapshot && (
        <DiffViewer
          oldText={selectedSnapshot.content}
          newText={content}
          snapshotUserName={selectedSnapshot.savedBy}
          snapshotUserColor={selectedSnapshot.savedByColor}
          currentUserName={currentUser.userName}
          currentUserColor={currentUser.color}
          onClose={() => setSelectedSnapshot(null)}
        />
      )}

      {replayOpen && (
        <ReplayViewer
          snapshots={snapshots}
          onClose={() => setReplayOpen(false)}
        />
      )}
    </div>
  );
}

export default DocumentView;
