# Requirements

## Implemented through Phase 8

- Run a React/TypeScript frontend and Django REST API separately.
- Store data in SQLite under a configurable persistent data directory.
- Register with full name, unique email, password confirmation, and voice classification.
- Authenticate by email and password; hash passwords with Django.
- Issue and revoke an API token; protect profile access and edits.
- Default development access to localhost.
- Update a personal profile and upload/remove a private, validated profile picture.
- Create, view, edit, and delete personal choirs with description, color, and a voice classification specific to each choir.
- Keep choir data isolated between authenticated accounts.
- Navigate a responsive workspace and customize theme, calendar week start, and dashboard sections.
- Create one reusable personal song record and assign it to multiple owned choirs.
- Manage personal song categories; search by title, filter by choir/category/language/key/voice, and sort alphabetically or by recency.
- Store PDF, image, YouTube, and uploaded video learning material metadata with private, authenticated file access.
- Create and manage personal choir events with dates, times, venues, deadlines, and statuses.
- Create ordered event lineups using reusable song records; prevent duplicates per event and store event-specific purpose, voice part, instructions, practice notes, and preparation status.
- Reorder lineups through drag-and-drop with server-side full-list validation, persistence, and visible failure recovery.
- Show upcoming events and song readiness on the dashboard.
- Practice an event lineup in its saved order with previous/next navigation, position, event notes, and manual preparation status updates.
- Provide one learning screen with in-app PDF, image-book, uploaded-video, and YouTube embed viewers; support drag-and-drop ordering of image pages.
- Persist per-user PDF/image page and uploaded-video/YouTube playback progress, validate it against owned materials, and restore it on return.
- Allow opt-in automatic navigation to the next song when marking the current song Ready.
- Display events in monthly, weekly, daily, and agenda calendar views, defaulting to month view.
- Apply the user's Sunday/Monday week-start preference and distinguish choirs with their configured colors.
- Show preparation deadlines and reminders for incomplete lineup songs; clicking an event opens its details, and clicking a practice reminder starts at the first song not marked Ready.
- Export an authenticated account-only JSON snapshot or ZIP backup containing related records, private media, manifest version, and integrity hashes.
- Import validated JSON/ZIP backups in merge or replace mode; enforce account isolation, relationships, content/file limits, safe ZIP paths, and create a recovery archive before replace.
- Provide Windows and Linux launcher scripts that prepare environments/dependencies, apply migrations without resetting data, start the app in development or built-preview mode, and safely stop only their tracked processes.

## Later requirements

- Final cross-platform quality/security review, including Windows launcher execution verification.

## Nonfunctional requirements

Maintainable modular code, server-side validation, ownership-enforced permissions, safe local media storage, configurable deployment, understandable errors, and accurate documentation. Production must use a proper application server and HTTPS rather than Django's development server.
