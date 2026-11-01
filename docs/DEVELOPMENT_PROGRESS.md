# Development progress

## Completed phases

Phases 1–7 are complete. Phase 8 launcher implementation is complete; Linux start/stop and preview mode have been exercised, but Windows execution remains unverified.

## Current phase: Phase 9 — Quality Assurance (in progress)

### Implemented in this work

- Django project and accounts app skeleton.
- Custom email-based user model with full name and default voice classification.
- Registration with password confirmation and Django password validators.
- Token login/logout and authenticated self-profile read/update.
- React/Vite/TypeScript authentication screens and API client.
- SQLite and local media path configuration, `.env.example`, localhost development defaults.
- Project and API documentation, MIT license, contribution guidance, and persistent agent instructions.
- Authentication tests for registration, mismatch rejection, profile access, and token revocation.
- Initial custom-user migration included; SQLite migrations applied successfully.
- Profile editing and private profile picture upload/removal, with image format, size, and dimensions validation.
- Choir CRUD with ownership filtering, per-account unique names, choir color, per-choir voice part, and custom voice labels.
- Responsive workspace shell, choir selector, overview dashboard, profile screen, light/dark theme, calendar week-start preference, and dashboard section preferences.
- Cross-account choir and profile-picture access tests.
- Personal songs with searchable title, composer/artist, language, key, description, and optional voice classification.
- Per-user custom categories and many-to-many song/choir assignments without song duplication.
- Song library filters for choir/category/language/key/voice and alphabetical/recent sorting.
- Private PDF, image, and video uploads plus validated YouTube URLs; authenticated attachment metadata/file endpoints and replacement/deletion cleanup.
- Song library UI with category management, editing, search/filter/sort, material upload/replacement/open/delete, and responsive layouts.
- Tests for song reuse, search/filter/sort, category CRUD, cross-account access, upload validation, private file delivery, and stored-file cleanup.
- Frontend interaction tests for song search/filter requests and song creation with choir assignment.
- Choir events with owner-scoped CRUD, date/time/deadline validation, statuses, and preparation progress counts.
- Ordered event lineups that reuse personal song records, prevent duplicate songs per event, store event-specific purpose/voice/instructions/practice notes/readiness, and compact positions after removal.
- Atomic full-lineup reorder endpoint with exact-set validation; song records referenced by events return a conflict on deletion until removed from those lineups.
- Responsive event list and event detail UI, event creation/editing, direct song creation from an event, and dnd-kit drag-and-drop with optimistic save and rollback/error feedback.
- Dashboard upcoming-event count and preview with links to event details.
- Tests for event CRUD and validation, duplicate and foreign song rejection, event-specific updates, lineup reorder/compaction, protected song deletion, and cross-account isolation.
- Event-based Practice Mode with in-order song navigation, manual readiness statuses, per-event notes, and an opt-in setting to move to the next song when marked Ready.
- Unified authenticated learning screen with in-app PDF, image-book, uploaded-video, and privacy-enhanced YouTube embed viewers.
- Drag-and-drop image page ordering with server-side exact-set ownership validation and failed-save rollback.
- Per-user, per-material viewing progress for PDF/image page numbers and uploaded-video/YouTube playback positions; authenticated progress endpoints preserve state between sessions without changing original material records.
- Tests for viewing-progress validation/ownership, image-page ordering, and practice navigation/status saves.
- Added FullCalendar month, week, day, and agenda views, with month as the default and the saved Sunday/Monday week start applied.
- Calendar filters by choir and colors event entries with each choir's selected color; event entries show readiness counts and open event details on click.
- Preparation deadlines and derived reminders for incomplete lineup songs are displayed as separate clickable calendar items; reminders open Practice on the first song not marked Ready.
- Calendar, Events, and Practice routes are lazy loaded. FullCalendar assets are fetched only when the calendar route opens, and the initial JavaScript chunk is about 418 KB uncompressed.
- Calendar mapping tests verify choir colors, event times, deadlines, practice reminders, incomplete-song navigation position, completed-event behavior, and the week-start setting.
- Authenticated account-scoped JSON export and ZIP backup endpoints; ZIP contains a versioned manifest, checksum-protected account JSON, and only that account's media.
- Validated JSON/ZIP import with merge and replace modes, relationship checks, upload type/content validation, archive traversal/duplicate/unexpected-path checks, size/count limits, and an account recovery ZIP before replace.
- Settings controls for JSON/ZIP downloads and JSON/ZIP imports with merge/replace selection and an explicit replace confirmation.
- Portability tests cover authentication and account scope, ZIP round-trip relationships/viewing progress/private media, unsafe ZIP rejection, invalid mode rejection, and invalid media content.
- Added Windows batch wrappers with PowerShell startup/shutdown scripts and Linux start/stop shell scripts.
- Launchers validate Python/Node versions, create backend virtual environments, install dependencies only when the requirement/lock manifests change, apply migrations without resetting the database, start dev or built-preview frontend modes, display URLs, and open a browser when requested.
- Launchers store PID files and logs under ignored `data/run/` and `data/logs/`; stop operations validate their target process and do not terminate unrelated services. Occupied ports fail with an actionable message.
- Added launcher usage, modes, port/environment settings, logs, LAN binding guidance, and production-server limitations to README and setup/architecture documentation.
- Tightened import preflight validation for field lengths/types, enumerated choices, event dates/times, lineup uniqueness/order, and material progress consistency.
- Made failed replace imports clean up newly written media and restore media deleted by model signals after database rollback; recovery archives now contain account media and are parsed by the same validated ZIP flow.
- Added production environment controls for HTTPS redirects, secure cookies, CSRF trusted origins, trusted reverse-proxy protocol headers, and opt-in HSTS settings.
- Added frontend interaction coverage for JSON/ZIP downloads, merge import payloads, and the replace confirmation/cancellation gate.
- Added coverage for the direct `/practice/:eventId/:index` URL inside the workspace and its YouTube-material render path.
- Added a Practice route error boundary with a recovery link and development-only exception message so render failures no longer leave a blank workspace.
- Fixed the Practice blank-screen crash caused by YouTube iframe teardown calling `getCurrentTime()` before the player was ready; playback position reads now tolerate missing, throwing, and invalid player methods.
- Fixed the YouTube embed appearing as a small video inside an oversized black area by removing the height-only cap and sizing the iframe mount to fill its responsive 16:9 frame.

### Verification

- `backend/.venv/bin/python backend/manage.py check` — passed (no issues).
- `backend/.venv/bin/python backend/manage.py makemigrations --check --dry-run` — passed (no changes detected).
- `python manage.py check` (from `backend/`) — passed (no issues).
- `python manage.py makemigrations --check --dry-run` (from `backend/`) — passed (no model changes pending).
- `python manage.py test` (from `backend/`) — passed (33 tests, including account portability validation, private media ZIP round-trips, and rollback media restoration).
- `npm test` (from `frontend/`) — passed (13 tests across 6 files, including practice workspace routing, YouTube material rendering, unready player handling, and route error recovery).
- `npm run build` (from `frontend/`) — passed (TypeScript and Vite production build; existing React Router `use client` bundler warnings only).
- `npm audit --audit-level=low` (from `frontend/`) — passed (0 vulnerabilities reported).
- `DJANGO_DEBUG=false ... manage.py check --deploy` with an explicit strong test key, HTTPS redirect/secure-cookie defaults, and HSTS settings — passed (no issues).
- `bash -n scripts/start-linux.sh scripts/stop-linux.sh` — passed.
- `scripts/start-linux.sh --help` — passed.
- `scripts/start-linux.sh --no-browser` with alternate ports — started both services; `scripts/stop-linux.sh` stopped both launcher-owned process groups. The pre-existing services on ports 8000/5173 remained running.
- `scripts/start-linux.sh --built --no-browser` with alternate ports — production frontend build and local Vite preview started; stop script stopped both launcher-owned processes.
- Startup on already occupied default ports — correctly refused to start; unrelated listeners remained running.
- Windows launcher execution — not run; this environment is Linux and has no PowerShell runtime.
- Browser-based responsive/UI review — not run; the computer-use browser host was unavailable in this session.
### Earlier phase verification history

- `python backend/manage.py check` — passed (no issues).
- `python backend/manage.py makemigrations --check --dry-run` — passed (no model changes pending).
- `python backend/manage.py test accounts choirs songs events` — passed (26 tests).
- `npm test` — passed (6 frontend tests including calendar reminders/week start and practice status updates/navigation).
- `python backend/manage.py migrate` — Phase 5 material viewing progress migration applied successfully.
- `npm install` — FullCalendar React v7.1.3 and `temporal-polyfill` installed; npm reported zero vulnerabilities. The environment blocked the esbuild postinstall script, but the production build succeeded.
- `npm run build` — passed (TypeScript and Vite production bundle); CalendarPage, Events, and Practice are emitted as separate lazy-loaded chunks.
- `npm audit` — passed (0 reported vulnerabilities after updating Vitest).

### Known limitations

- Token authentication does not expire/refresh.
- There is no self-service password reset.
- Windows launcher start/stop and browser-based responsive review remain unverified because this environment has no PowerShell runtime and its browser host is unavailable.
- Frontend tests cover library workflows, event list filtering/readiness, and practice status/navigation. Drag-and-drop interactions are primarily covered by backend ordering tests and still need dedicated browser-level UI tests.
- Calendar tests cover event/deadline/reminder data mapping and first-day preference. FullCalendar's toolbar and click behavior have not yet been exercised in a real browser session.
- PDF page progress is saved through the in-app viewer's page field; browser-native PDF controls may change their internal page display without reporting the new page back to ChoirLineup.
- The development-only frontend imports Google Fonts remotely.
- Merge identifies existing records using natural field matches (choir/category names and song/event details); it does not preserve source primary keys as durable external IDs.
- Replace recovery archives are written before the database transaction; failed restores now remove newly written files and attempt to restore pre-import media automatically. If that compensation fails, the recovery archive remains available for manual restore from Settings.
- Settings import/export logic is covered by frontend interaction tests. Browser-based responsive review and FullCalendar toolbar/click behavior still need a real browser session.

### Next tasks

Finish the full Phase 9 verification and run Windows launcher checks on a Windows host when available.
