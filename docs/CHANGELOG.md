# Changelog

## Unreleased

- Fixed a Practice blank-screen crash when the YouTube iframe player is torn down before its playback methods are ready; added safe progress reads and regression coverage.
- Fixed YouTube learning videos rendering small within a large black player area; the responsive iframe and mount now fill a true 16:9 frame.
- Added a Practice route error boundary with a recovery link and development-only error details, plus direct-route and YouTube-material UI coverage.
- Added frontend interaction tests for JSON/ZIP export downloads, merge import payloads, and replace confirmation/cancellation.
- Added production TLS controls with HTTPS redirects, secure cookies, CSRF trusted origins, optional trusted-proxy protocol handling, and opt-in HSTS.
- Hardened backup preflight validation and made replacement rollback remove staged files and restore pre-import private media.
- Added Windows/Linux native start and stop launchers with dependency checks, safe migrations, dev/built-preview modes, logs, and owned-process tracking.
- Documented launcher options, LAN configuration, port conflicts, and the distinction between local Vite preview and production serving.
- Added account-scoped JSON export/import and ZIP backup/restore with private media, format manifest/checksums, ownership and relationship validation, safe archive handling, merge/replace behavior, and replace recovery archives.
- Added Data portability controls to Settings and documented backup/restore workflows.
- Added server-side validation and tests for round-trip restoration of uploaded media and rejection of malformed media content.
- Added Django REST Framework backend and React/TypeScript Vite frontend foundations.
- Added email registration, token login/logout, profile API, and authentication UI.
- Added SQLite/environment configuration, project documentation, and MIT license.
- Added the initial custom-user migration and authentication tests; the backend checks and frontend production build pass.
- Added profile picture upload and private delivery, personal choir CRUD, the responsive workspace dashboard/navigation, theme and dashboard preferences, and choir-specific voice classifications.
- Added reusable songs, personal custom categories, choir assignments, library search/filter/sort, and private validated PDF/image/video uploads and YouTube links with authenticated file access.
- Added frontend tests for song-library filtering and creation; updated test guidance and patched Vitest dependencies (npm audit: 0 vulnerabilities).
- Added owner-scoped event CRUD with date/time/deadline validation and statuses, plus ordered per-event song lineups with uniqueness constraints, event-specific notes/statuses, drag-and-drop reorder autosave, and song-reference deletion protection.
- Added responsive event list/detail workflows, create-from-event song flow, and an upcoming-event dashboard preview.
- Added event-based Practice Mode with ordered navigation, manually saved preparation statuses, event notes, and optional automatic navigation when a song is marked Ready.
- Added authenticated in-app PDF, image-book, uploaded video, and YouTube embed viewers, image-page drag-and-drop ordering, and per-account viewing progress for sheet music/video.
- Added a lazy-loaded FullCalendar month/week/day/agenda page with choir filtering/colors, event readiness summaries, preparation-deadline markers, practice reminders, and Sunday/Monday week-start support.

