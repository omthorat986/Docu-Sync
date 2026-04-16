# Docu-Sync — Complete Project Reference

> A real-time collaborative document editor with authentication, version history, rich text, and live presence.

---

## Table of Contents
1. [What Is Docu-Sync?](#1-what-is-docu-sync)
2. [Tech Stack](#2-tech-stack)
3. [Directory Structure](#3-directory-structure)
4. [Data Models (MongoDB)](#4-data-models-mongodb)
5. [Backend Architecture](#5-backend-architecture)
   - REST API Routes
   - Socket.IO Events
   - Access Control Logic
6. [Frontend Architecture](#6-frontend-architecture)
   - Routing
   - Custom Hooks
   - Component Tree
7. [Full Request & Data Flow](#7-full-request--data-flow)
   - User Signup / Login
   - Dashboard Load
   - Create Document
   - Opening & Editing a Document
   - Real-time Sync
   - Snapshots & Restore
   - Cursor Presence
   - Export
8. [Key Design Decisions](#8-key-design-decisions)

---

## 1. What Is Docu-Sync?

Docu-Sync is a **multi-user, real-time document collaboration platform** — similar in concept to a lightweight Google Docs. Multiple authenticated users can:

- Create documents of three types: **Rich Text**, **Code**, or **Notes**
- Edit the same document simultaneously and see each other's changes live
- See where other users' cursors are in real time
- Save and restore version **snapshots**
- Share documents via a link (public or private)
- Export documents as TXT, HTML, or PDF

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Backend server | Node.js + Express.js |
| Real-time | Socket.IO |
| Database | MongoDB via Mongoose (with in-memory fallback for dev) |
| Authentication | JWT (jsonwebtoken) + bcryptjs |
| Frontend | React 19 (Vite build) |
| Routing (FE) | react-router-dom v7 |
| Rich text editor | Quill.js v1 (direct DOM init) |
| Live cursors in Quill | quill-cursors |
| Export | html2pdf.js (lazy-loaded) |
| Document IDs | nanoid (8-char URL-safe IDs) |

---

## 3. Directory Structure

```
Docu-Sync/
├── backend/
│   ├── server.js              ← Express app + Socket.IO + DB connection
│   ├── middleware/
│   │   └── auth.js            ← JWT bearer-token verification middleware
│   ├── models/
│   │   ├── User.js            ← Mongoose User schema
│   │   ├── Document.js        ← Mongoose Document schema (core)
│   │   ├── Snapshot.js        ← Version snapshot schema
│   │   └── ActivityLog.js     ← Audit log schema (7-day TTL)
│   └── routes/
│       ├── auth.js            ← POST /api/auth/signup, /login
│       └── docs.js            ← CRUD for user's document list
│
└── frontend/src/
    ├── App.jsx                ← BrowserRouter + route definitions
    ├── main.jsx               ← React root mount
    ├── index.css              ← Global styles
    ├── views/
    │   ├── Dashboard.jsx      ← /dashboard — document list + create
    │   └── DocumentView.jsx   ← /doc/:roomId — live editor wrapper
    ├── components/
    │   ├── JoinScreen.jsx     ← /login — signup/login form
    │   ├── Header.jsx         ← Top bar: title edit, share, snapshot
    │   ├── EditorPanel.jsx    ← Quill (text) or textarea (code/notes) + export
    │   ├── Sidebar.jsx        ← Snapshot list + activity log
    │   ├── DiffViewer.jsx     ← Word-level diff between snapshot and live
    │   └── ReplayViewer.jsx   ← Step-through snapshot replay
    ├── hooks/
    │   ├── useSocket.js       ← Creates Socket.IO connection
    │   ├── useDocument.js     ← All socket listeners + local state
    │   └── useAutosave.js     ← 6s debounce auto-snapshot
    └── utils/
        └── caretHelper.js     ← Pixel-coordinate math for textarea cursors
```

---

## 4. Data Models (MongoDB)

### `User`
```js
{
  username : String  (unique, required)
  email    : String  (unique, required)
  password : String  (bcrypt hash, required)
  timestamps: true
}
```

### `Document`
```js
{
  roomId       : String   // nanoid(8) e.g. "V1StGXR8" — unique room key
  ownerId      : ObjectId → User
  title        : String   (default: "Untitled Document")
  type         : enum["text","code","notes"] (default: "text")
  collaborators: [ObjectId → User]
  isPublic     : Boolean  (default: false)
  content      : String   // Quill Delta JSON string (text) OR plain text (code/notes)
  updatedAt    : Date
}
```

### `Snapshot`
```js
{
  roomId      : String  (indexed)
  content     : String  // full content at the time of save
  savedBy     : String  // username
  savedByColor: String  // hex color
  timestamp   : Date    (indexed desc)
}
```

### `ActivityLog`
```js
{
  roomId    : String  (indexed)
  type      : String  // "join" | "leave" | "edit" | "snapshot" | "restore" | "system"
  message   : String
  userName  : String
  userColor : String
  timestamp : Date    (TTL 7 days — auto-deleted by MongoDB)
}
```

---

## 5. Backend Architecture

### Server Entry (`server.js`)

The file does everything in one place:
1. Creates Express app + HTTP server + Socket.IO server
2. Mounts CORS and JSON body parser
3. Mounts auth routes (`/api/auth`) and docs routes (`/api/docs`)
4. Connects to MongoDB (real URI from `.env` or in-memory fallback)
5. Registers REST routes for document operations (`/api/document/:roomId/…`)
6. Registers all Socket.IO event handlers

### REST API Map

#### Auth Routes (`/api/auth`) — No Authentication Required

| Method | Path | What it does |
|---|---|---|
| `POST` | `/api/auth/signup` | Validates body, checks for duplicate user/email, bcrypt-hashes password, saves User, returns `{ success: true }` |
| `POST` | `/api/auth/login` | Finds user by email, `bcrypt.compare` password, signs 7-day JWT `{ userId, username }`, returns `{ token, user }` |

#### Docs Routes (`/api/docs`) — **Requires JWT**

All routes call `authMiddleware` first (Bearer token in `Authorization` header).

| Method | Path | Who can call | What it does |
|---|---|---|---|
| `GET` | `/api/docs` | Any auth user | Returns all docs where `ownerId === me` OR `collaborators includes me` |
| `POST` | `/api/docs/create` | Any auth user | Creates new Document with `nanoid(8)` roomId, sets type + default content |
| `POST` | `/api/docs/add-collaborator` | Owner only | Finds user by email, `$addToSet` to prevent duplicates |
| `PUT` | `/api/docs/:roomId/rename` | Owner only | Validates non-empty title, saves |
| `PUT` | `/api/docs/:roomId/visibility` | Owner only | Toggles `isPublic` |
| `DELETE` | `/api/docs/:roomId` | Owner only | `Promise.all` cascade-deletes Document + Snapshot + ActivityLog |

#### Document REST Routes (`/api/document/:roomId`) — **Requires JWT**

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/document/:roomId` | Access-checked fetch of doc + all snapshots + activity logs |
| `POST` | `/api/document/:roomId/snapshot` | Saves current content as a new Snapshot, emits socket events |
| `POST` | `/api/document/:roomId/restore/:snapshotId` | Replaces doc content with snapshot content, broadcasts |
| `POST` | `/api/document/:roomId/reset` | Resets content to default, deletes all snapshots/logs |

### Access Control (`getDocWithAccess`)

Every document operation runs through this guard:
```
getDocWithAccess(roomId, userId)
  → doc not found?        → throw NOT_FOUND  (→ 404)
  → doc.isPublic?         → allow ✓
  → no userId provided?   → throw FORBIDDEN  (→ 403)
  → userId === ownerId?   → allow ✓
  → userId in collaborators? → allow ✓
  → else                  → throw FORBIDDEN  (→ 403)
```

### JWT Middleware (`middleware/auth.js`)

```
Request arrives with header: Authorization: Bearer <token>
  → No header?           → 401 Access denied
  → jwt.verify(token, JWT_SECRET)
     → invalid/expired?  → 401 Invalid token
     → valid?            → attach decoded { userId, username } to req.user
                          → call next()
```

---

### Socket.IO Events

The socket layer is the **real-time engine** — it is intentionally kept separate from MongoDB auth (for low latency), but it still verifies JWT on critical events.

#### Client → Server

| Event | Payload | Server action |
|---|---|---|
| `join-room` | `{ roomId, userName, color, token }` | Verifies JWT, checks `getDocWithAccess`, joins the socket room, broadcasts presence, emits `initial-document` back to the joining client |
| `send-changes` | `{ roomId, content, userName, token }` | Re-verifies JWT + access, broadcasts `receive-changes` to all OTHER clients in room, updates doc content in MongoDB (debounced 300ms on client) |
| `log-edit` | `{ roomId, userName, userColor }` | Creates an ActivityLog entry, broadcasts `activity-updated` |
| `cursor-move` | `{ roomId, userId, cursor }` | Relays `cursor-update` to all other clients in room (no DB write — ephemeral) |

#### Server → Client

| Event | Payload | Triggered by |
|---|---|---|
| `initial-document` | `{ content, snapshots, activityLogs, activeUsers }` | User joining room |
| `receive-changes` | `{ content, userName }` | Another user typing |
| `users-updated` | `[{ socketId, userName, color }]` | Any join or disconnect |
| `document-updated` | `{ content }` | Snapshot save or restore |
| `snapshots-updated` | `[Snapshot]` | Snapshot save or restore |
| `activity-updated` | `[ActivityLog]` | Any activity |
| `cursor-update` | `{ userId, cursor }` | Cursor move relay |
| `user-left` | `socketId` | User disconnect (cleanup remote cursors) |
| `join-error` | `{ error }` | Access denied on join |

#### On disconnect:
- Removes user from `activeUsersByRoom` map
- Broadcasts `users-updated`
- Creates a "leave" ActivityLog
- Emits `user-left` so clients remove the remote cursor

---

## 6. Frontend Architecture

### Routing (`App.jsx`)

```
BrowserRouter
├── /              → redirect to /dashboard (if logged in) or /login
├── /login         → JoinScreen (signup + login form)
├── /dashboard     → Dashboard (protected — redirects to /login if no token)
└── /doc/:roomId   → DocumentView (checks token; stores intended path for deep-link redirect)
```

**Deep-link redirect flow:**  
User visits `/doc/V1StGXR8` → no token → saved as `location.state.from` → redirected to `/login` → after successful login → `navigate(from)` → lands at `/doc/V1StGXR8`.

**Auth state:**  
Stored in `localStorage`:
- `docu-sync-token` — JWT
- `docu-sync-userId` — MongoDB `_id`
- `docu-sync-userName` — display name
- `docu-sync-userColor` — hex color chosen at login

---

### Custom Hooks

#### `useSocket(serverUrl, joined, roomId, userName, userColor, userId, token)`
- Creates a Socket.IO connection when `joined = true`
- Emits `join-room` immediately on connect with token
- Returns a stable `socket` ref
- Disconnects on unmount

#### `useDocument(socket, roomId, userName, userColor, token)`
- Registers all socket listeners (`initial-document`, `receive-changes`, `cursor-update`, etc.)
- Manages state: `content`, `snapshots`, `activityLogs`, `activeUsers`, `remoteCursors`, `documentMeta`
- `documentMeta` contains `{ title, isPublic, ownerId, type }`
- **`updateContent(newContent)`** — updates local state, debounces socket `send-changes` emit by **300ms** (prevents socket spam), logs edit after 1200ms
- **`sendCursorMove(index)`** — throttled at 50ms, emits `cursor-move`
- Guards incoming remote changes with `isRemoteChange` ref to **prevent echo loops**

#### `useAutosave(apiUrl, content, roomId, userName, userColor, lastSnapshotRef, token)`
- Watches `content` changes
- After **6 seconds of no new changes**, auto-saves a snapshot via `POST /api/document/:roomId/snapshot`
- Skips if content matches last saved snapshot (no-op)
- Exposes `saveSnapshot(content, mode)` for manual trigger

---

### Component Tree

```
App.jsx (Router)
│
├── JoinScreen.jsx
│   ├── Signup form (POST /api/auth/signup)
│   └── Login form  (POST /api/auth/login → stores token → navigate)
│
├── Dashboard.jsx
│   ├── "New Document" button → Create Modal (type selector)
│   ├── Document cards (title, type badge, owner/collaborator tag)
│   ├── Inline rename input (PUT /api/docs/:roomId/rename)
│   └── Delete button → cascade DELETE /api/docs/:roomId
│
└── DocumentView.jsx
    ├── Header.jsx
    │   ├── Editable title (click → input → PUT /api/docs/:roomId/rename)
    │   ├── "📋 Copy Link" button (navigator.clipboard)
    │   ├── "🌎/🔒 Public/Private" toggle (PUT /api/docs/:roomId/visibility)
    │   ├── User badges (live presence)
    │   ├── Auto-save status pill
    │   └── "Save Snapshot" button
    │
    ├── EditorPanel.jsx
    │   ├── IF type = "text" → RichEditor (Quill.js, direct DOM init)
    │   │   ├── Quill toolbar: H1/H2/H3, Bold, Italic, Underline, Strike,
    │   │   │    Color, List, Blockquote, Code-block, Link, Clean
    │   │   ├── quill-cursors: renders remote users' cursors inside Quill
    │   │   └── Delta JSON ↔ socket sync
    │   ├── IF type = "code" → PlainEditor (textarea, monospace dark theme)
    │   │   └── Remote cursors via caretHelper pixel math
    │   └── IF type = "notes" → PlainEditor (textarea, default style)
    │   └── "⬇ Export" dropdown
    │       ├── TXT: strip HTML → Blob download
    │       ├── HTML: wrap in full HTML doc → Blob download
    │       └── PDF: lazy-import html2pdf.js → render → save
    │
    └── Sidebar.jsx
        ├── Snapshot list (restore, diff)
        │   └── DiffViewer.jsx (word-level diff modal)
        ├── Activity log
        └── "Replay" button → ReplayViewer.jsx (step through snapshots)
```

---

## 7. Full Request & Data Flow

### User Signup / Login

```
Browser: POST /api/auth/signup { username, email, password }
  Backend:
    → validate fields
    → check for duplicate email/username
    → bcrypt.hash(password, 10)
    → User.create(...)
    → return { success: true }

Browser: POST /api/auth/login { email, password }
  Backend:
    → User.findOne({ email })
    → bcrypt.compare(password, user.password)
    → jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' })
    → return { token, user: { id, username, email } }

Browser:
  → localStorage.setItem('docu-sync-token', token)
  → localStorage.setItem('docu-sync-userId', id)
  → localStorage.setItem('docu-sync-userName', username)
  → localStorage.setItem('docu-sync-userColor', selectedColor)
  → navigate('/dashboard') (or deep-linked path)
```

---

### Dashboard Load

```
Browser: GET /api/docs  [Authorization: Bearer <token>]
  Backend:
    → authMiddleware: jwt.verify(token) → req.user.userId
    → Document.find({ $or: [ { ownerId: userId }, { collaborators: userId } ] })
    → populate('ownerId', 'username email')
    → return sorted array of documents

Browser:
  → renders card for each document
  → shows type badge (text / code / notes)
  → shows Owner or Collaborator tag
  → shows Last Updated timestamp
```

---

### Create Document

```
Browser: POST /api/docs/create { type: "text" }  [Auth header]
  Backend:
    → nanoid(8) → generates e.g. "V1StGXR8"
    → set default content:
        text  → '{"ops":[{"insert":"Welcome to DocuSync!\n"}]}'
        code/notes → plain text string
    → Document.create({ roomId, ownerId, title, type, content, isPublic: false })
    → return new document

Browser:
  → navigate('/doc/V1StGXR8')
```

---

### Opening & Editing a Document

```
Browser navigates to /doc/V1StGXR8
  DocumentView mounts:

1. useSocket hook:
   → io(SOCKET_URL)
   → socket.connect()
   → socket.emit('join-room', { roomId: 'V1StGXR8', userName, color, token })

2. Server on('join-room'):
   → jwt.verify(token) → verifiedUserId
   → getDocWithAccess('V1StGXR8', verifiedUserId)
      → checks isPublic / ownerId / collaborators
   → socket.join('V1StGXR8')
   → push to activeUsersByRoom['V1StGXR8']
   → addActivity({ type: 'join', message: 'Alice joined...' })
   → Document.findOne({ roomId })
   → Snapshot.find({ roomId }).sort(timestamp:1)
   → ActivityLog.find({ roomId }).sort(timestamp:1)
   → socket.emit('initial-document', { content, snapshots, activityLogs, activeUsers })
   → io.to(roomId).emit('users-updated', [...])

3. Browser: useDocument handles 'initial-document':
   → setContent(data.content)
   → setSnapshots(data.snapshots)
   → setActivityLogs(data.activityLogs)
   → setActiveUsers(data.activeUsers)
   → setDocumentMeta({ title, isPublic, ownerId, type })

4. EditorPanel renders based on documentMeta.type:
   → 'text'  → Quill initialised with Delta from JSON.parse(content)
   → 'code'  → <textarea> with monospace dark theme
   → 'notes' → <textarea> with normal style
```

---

### Real-time Sync (Typing)

```
User A types in Quill/textarea:
  → onChange(newContent) called (Quill: JSON.stringify(delta), textarea: string)
  → useDocument.updateContent(newContent):
     → setContent(newContent) — immediate local update
     → setLastEditedBy(userName) — shows "Alice is making changes"
     → debounceRef: wait 300ms after last keystroke, then:
        socket.emit('send-changes', { roomId, content: newContent, userName, token })
     → after 1200ms: socket.emit('log-edit', { roomId, userName, userColor })
     → after 1800ms: setLastEditedBy('') — clears banner

Server on('send-changes'):
  → jwt.verify(token)
  → getDocWithAccess(roomId, userId) — re-validates every write
  → socket.to(roomId).emit('receive-changes', { content, userName })
                        ↑ broadcasts to ALL OTHER clients in the room
  → Document.findOneAndUpdate({ roomId }, { $set: { content, updatedAt } })

User B receives 'receive-changes':
  → isRemoteChange.current = true (loop guard)
  → For Quill: parse Delta, setContents(..., 'silent'), preserve selection
  → For textarea: setContent(data.content)
  → setLastEditedBy(userName) — shows "Bob is making changes"
  → isRemoteChange.current = false
```

---

### Snapshots & Restore

```
Manual snapshot (user clicks "Save Snapshot"):
  → POST /api/document/:roomId/snapshot { content, savedBy, savedByColor, mode: 'manual' }
  → Server:
     → getDocWithAccess check
     → compare with latest snapshot — if identical, return early
     → doc.content = content; doc.save()
     → Snapshot.create({ roomId, content, savedBy, ... })
     → ActivityLog.create({ type: 'snapshot', ... })
     → io.to(roomId).emit('document-updated', { content })
     → io.to(roomId).emit('snapshots-updated', allSnapshots)
     → io.to(roomId).emit('activity-updated', allLogs)

Auto-snapshot (6 seconds after last change):
  → Same flow, mode: 'auto'
  → Skipped if content === lastSnapshotContentRef.current

Restore snapshot:
  → POST /api/document/:roomId/restore/:snapshotId { restoredBy, restoredByColor }
  → Server:
     → getDocWithAccess check
     → Snapshot.findOne({ _id: snapshotId, roomId })
     → doc.content = snapshot.content; doc.save()
     → ActivityLog.create({ type: 'restore', ... })
     → Broadcasts document-updated + snapshots-updated + activity-updated
  → All connected clients receive new content in real time
```

---

### Cursor Presence

```
For 'code' / 'notes' documents (textarea):
  User moves cursor:
    → textarea onSelect/onClick/onKeyUp → sendCursorMove(selectionStart)
    → throttled 50ms: socket.emit('cursor-move', { roomId, userId: socket.id, cursor: { index, userName, userColor } })
  
  Server relay:
    → socket.to(roomId).emit('cursor-update', { userId, cursor })
    (NO database write — fully ephemeral)
  
  Other clients:
    → setRemoteCursors(prev => ({ ...prev, [userId]: cursor }))
    → renderCursors(): getCaretCoordinates(textarea, cursor.index) → pixel X,Y
    → renders colored <div> with floating name badge at those coordinates

For 'text' documents (Quill):
  → quill-cursors module handles rendering
  → On remoteCursors update:
     → cursors.createCursor(userId, userName, userColor)
     → cursors.moveCursor(userId, { index, length: 0 })
  → Quill-cursors draws the blinking caret + label inside the editor natively

On disconnect:
  → Server emits user-left(socket.id)
  → Clients: delete remoteCursors[socketId] → cursor disappears
```

---

### Export

```
User clicks "⬇ Export" → dropdown shows TXT / HTML / PDF

TXT:
  → If type='text': document.querySelector('.ql-editor').innerHTML → div.innerText (strips tags)
  → If code/notes: raw content string
  → new Blob([text], 'text/plain') → <a download> trigger

HTML:
  → If type='text': .ql-editor innerHTML
  → If code/notes: wrap in <pre> tag with monospace style
  → Wrap in full HTML document with <head>, <title>
  → Blob download as .html

PDF:
  → Lazy import: const html2pdf = (await import('html2pdf.js')).default
  → Create temp <div> with title + HTML content
  → Append to document.body
  → html2pdf().set({ filename, margin, html2canvas.scale:2 }).from(div).save()
  → Remove temp div
```

---

## 8. Key Design Decisions

| Decision | Rationale |
|---|---|
| **Three MongoDB collections** (Document, Snapshot, ActivityLog) | Avoids 16MB BSON limit from embedded arrays; allows independent querying, pagination, and TTL deletion |
| **Socket auth separate from REST auth** | Sockets are verified by JWT on join & send, but not blocked by middleware — keeps latency minimal |
| **isRemoteChange ref flag** | Prevents an infinite echo loop: Client A types → emits to Server → Server broadcasts to Client A → Client A would re-emit → loop. The ref breaks this. |
| **300ms debounce on socket emit** | Prevents socket storms during fast typing; MongoDB would thrash without it |
| **50ms throttle on cursor emit** | Mouse-move events fire very fast; throttling keeps the socket channel clean |
| **Quill Delta stored as JSON string** | Delta format preserves formatting semantics; plain HTML would lose structure info. Stored as `String` in MongoDB for simplicity. |
| **nanoid(8) for roomIds** | Short (8 chars), URL-safe, collision-resistant, shareable as clean links |
| **In-memory MongoDB fallback** | `mongodb-memory-server` starts automatically if `MONGO_URI` is not set, allowing zero-config local development |
| **`$addToSet` for collaborators** | MongoDB native deduplication — no code-level check needed |
| **Cascade delete via `Promise.all`** | Deleting a document removes all its Snapshots and ActivityLogs atomically in parallel |
| **Quill initialized via direct DOM ref (not react-quill)** | `react-quill@2` uses `ReactDOM.findDOMNode` which was removed in React 19; direct `new Quill(containerRef.current)` is framework-agnostic and stable |
| **html2pdf lazy-imported** | 936KB bundle — loading it on demand (only when user clicks Export PDF) keeps initial page load fast |
