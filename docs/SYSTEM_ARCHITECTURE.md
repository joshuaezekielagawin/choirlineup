# System architecture

## Current topology (Phase 8)

```text
Browser (React + TypeScript + Vite :5173)
    └── Axios requests with DRF token ──> Django REST API (:8000)
                                          ├── SQLite (data/db/db.sqlite3)
                                          └── Private local media (data/media/)
```

The frontend and backend have independent dependency manifests. Django owns accounts, password hashing, API validation, token authentication, choir ownership, and the SQLite schema. Profile pictures are validated with Pillow, stored under `MEDIA_ROOT`, and streamed only by an authenticated endpoint for the current user. The React frontend uses React Hook Form and Tailwind CSS alongside a project stylesheet; it stores the returned token in local storage and attaches it to API calls. Theme, calendar week start, and dashboard display preferences are currently saved in browser local storage. Runtime data is kept under `data/`, outside source modules.

## Modules

- `backend/config`: Django settings and ASGI/WSGI entry points.
- `backend/accounts`: custom email-based account model, serializers, authentication/profile endpoints, and authenticated picture delivery.
- `backend/choirs`: user-owned choir model and CRUD API.
- `backend/songs`: user-owned reusable songs/categories, choir links, material metadata, validated local uploads, and private file delivery.
- `backend/events`: user-owned events, event song relationships, validation, owner-scoped lineup endpoints, and atomic lineup reorder.
- `backend/songs`: also owns `MaterialViewingProgress`, keyed by user and attachment; the authenticated API scopes progress to the current user and their song material.
- `frontend/src`: React route shell, authentication views, workspace/dashboard, choir/song/event/practice/calendar workflows, API client, preferences, and styling. dnd-kit manages lineup and image-page sorting; the API persists complete ordering and the UI restores the previous order on failure. Learning media is fetched as authenticated blobs and displayed by in-app iframe/image/video players. FullCalendar is loaded on demand with month/week/day/agenda views and derives deadline/practice markers from event data.
- `backend/accounts/portability.py`: account-only versioned snapshots and safe JSON/ZIP import/export. It validates archive members and checksums without extracting arbitrary paths, validates relationships and media, and writes an account-only recovery ZIP before replace.

## Configuration and deployment

`.env.example` documents environment configuration. Django reads an ignored root `.env` without overriding process variables. SQLite defaults to `data/db/db.sqlite3`; media defaults to `data/media`. `CHOIRLINEUP_MAX_ATTACHMENT_MB` controls the maximum single song material upload. Defaults are development-only and bind locally. Debug-off startup requires an explicit secret key and enables HTTPS redirect plus secure session/CSRF cookies by default. HSTS remains opt-in; TLS proxy headers are trusted only when explicitly enabled. Network deployment needs explicit host/origin/CSRF configuration, a production server, HTTPS, static serving, and a backup plan.

## Planned evolution

Calendar reminders are derived in the frontend from owned event deadlines and incomplete lineup entries, so there is no separate reminder table or endpoint. Events have a direct user owner as well as an owned choir relationship; lineup entries are accessible only through their event owner and can reference only the user's songs. Viewing progress is independently owned by a user and an attachment; every progress/file endpoint checks that the attachment's song belongs to that user. Uploaded assets use authenticated ownership-checked file endpoints. SQLite remains default while settings and storage boundaries should permit future substitution.

Phase 7 portability endpoints serialize a consistent account snapshot inside a database transaction. ZIP backups include the JSON snapshot and only files reachable from that account; they intentionally do not include the full SQLite file. Replace recovery archives are account-scoped and stored under `BACKUP_ROOT` (default `data/backups/`).

Phase 8 native launchers are thin platform-specific process managers. They create the virtual environment only when absent, install dependencies when manifests change, run non-destructive migrations, and start Django plus either Vite development mode or a built Vite preview. Process identifiers and logs stay in ignored `data/run/` and `data/logs/` paths. Linux uses separate process groups and verifies the tracked PID's working directory/command before signaling; Windows validates the recorded process command and uses `taskkill /T` only for that launched process tree. Both launchers default to loopback and refuse occupied ports. Vite preview plus Django's development server is a local preview, not a production deployment.
