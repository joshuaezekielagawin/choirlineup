# API documentation

All endpoints are rooted at `/api/`. JSON requests should use `Content-Type: application/json`. Protected endpoints require `Authorization: Token <token>`. DRF's standard validation response uses HTTP 400; unauthenticated protected requests return 401.

## Authentication

### `POST /api/auth/register/`

Body: `{ "email": "singer@example.com", "full_name": "A Singer", "default_voice": "alto", "password": "...", "confirm_password": "..." }`. Voice values: `soprano`, `alto`, `tenor`, `bass`, `custom`. Success: HTTP 201 `{ "token": "…", "user": { "id": 1, "email": "…", "full_name": "…", "default_voice": "alto" } }`.

### `POST /api/auth/login/`

Body: `{ "email": "…", "password": "…" }`. Success: HTTP 200 with token and user. Invalid credentials return validation error without identifying which field failed.

### `POST /api/auth/logout/`

Requires token. Deletes that token and returns HTTP 204.

### `GET /api/auth/profile/`

Requires token; returns only the authenticated account's public profile fields.

### `PATCH /api/auth/profile/`

Requires token. Accepts `full_name`, `default_voice`, optional `profile_picture` (multipart JPEG/PNG/WebP, max 5 MB), or `remove_profile_picture: true`. Email and account ID are read-only. Response includes `profile_picture_url` as `/auth/profile/picture/` when a picture exists.

### `GET /api/auth/profile/picture/`

Requires token. Streams the authenticated user's own picture with a private no-store cache policy; returns 404 when none is uploaded.

## Choirs

All choir endpoints require authentication. The backend assigns ownership from the token; request bodies cannot set the owner. Other users' choir IDs return 404.

- `GET /api/choirs/`: list the current user's choirs.
- `POST /api/choirs/`: create. Body: `{ "name": "Community Choir", "description": "", "color": "#728b72", "voice_classification": "alto", "custom_voice": "" }`.
- `GET /api/choirs/{id}/`: retrieve one owned choir.
- `PATCH /api/choirs/{id}/`: update supplied choir fields.
- `DELETE /api/choirs/{id}/`: delete the choir record (204).

Allowed voice classifications are `soprano`, `alto`, `tenor`, `bass`, and `custom`; custom requires a `custom_voice` label. Color must be a six-digit hex value. Choir names are unique per user (case-insensitive validation). IDs and timestamps are read-only.

## Song categories

All category endpoints require authentication and are scoped to the current user.

- `GET /api/song-categories/`: list custom categories.
- `POST /api/song-categories/`: create with `{ "name": "Hymn" }`.
- `PATCH /api/song-categories/{id}/`: rename an owned category.
- `DELETE /api/song-categories/{id}/`: remove the category and its song links.

## Songs

- `GET /api/songs/`: list the user's songs. Optional query parameters: `search` (title contains), `choir`, `category`, `language`, `key`, `voice`, and `sort` (`title` or default recent).
- `POST /api/songs/`: create. Fields: `title`, `composer_artist`, `language`, `musical_key`, `description`, `voice_classification`, `choir_ids` (array of owned choir IDs), and `category_ids` (array of owned category IDs).
- `GET /api/songs/{id}/`: retrieve an owned song.
- `PATCH /api/songs/{id}/`: update supplied song fields and optionally replace choir/category ID arrays.
- `DELETE /api/songs/{id}/`: delete song and its learning materials.

The same song can be assigned to multiple of the user's choirs. Foreign choir/category IDs are rejected. Search applies to song title; the default list sort is newest first, with `sort=title` for alphabetical ordering.

## Song learning materials

- `GET /api/songs/{song_id}/attachments/`: list materials for an owned song.
- `POST /api/songs/{song_id}/attachments/`: add a material. Use JSON `{ "kind": "youtube", "url": "https://youtu.be/dQw4w9WgXcQ", "title": "Rehearsal" }` for YouTube. Use multipart form data with `kind` (`pdf`, `image`, or `video`) and `file` for uploads. Image files may be uploaded multiple times as separate ordered pages.
- `GET /api/attachments/{id}/`: inspect material metadata.
- `PATCH /api/attachments/{id}/`: edit title/YouTube URL or replace the uploaded file (multipart).
- `DELETE /api/attachments/{id}/`: delete metadata and stored file.
- `GET /api/attachments/{id}/file/`: stream an owned private file; YouTube links have no file endpoint.
- `GET /api/attachments/{id}/progress/`: get the authenticated user's viewing progress for an owned attachment. A new record returns `{ "last_page": 1, "video_position": "0.00", "updated_at": null }`.
- `PATCH /api/attachments/{id}/progress/`: update `last_page` (image/PDF page number) or `video_position` (seconds, 0–86400) for uploaded videos or YouTube links. Image page numbers are checked against the current number of image pages. Progress belongs to the viewing account and is not shared through the Song record.
- `POST /api/songs/{song_id}/attachments/reorder-images/`: reorder all image pages for an owned song using `{ "attachment_ids": [15, 12, 18] }`. IDs must exactly match that song's image attachments; the update is transactional and adjusts saved page numbers to the new order. Deleting or adding an image page also keeps existing progress within the updated page sequence.

Uploads validate file extension and content. Accepted files are PDF, JPEG/PNG/WebP images, and MP4/M4V/MOV/WebM videos. The maximum single attachment size is controlled by `CHOIRLINEUP_MAX_ATTACHMENT_MB` (100 MB default). Uploaded files are stored privately and are never exposed through public media URLs. YouTube URLs require HTTPS and a recognized YouTube host; ChoirLineup stores the link and does not download the video.

## Events

All event and lineup endpoints require authentication. Events are filtered by the current user; choir IDs and song IDs in writes are restricted to records owned by that account. Foreign event and lineup IDs return 404.

- `GET /api/events/`: list owned events with nested choir and ordered lineup summaries, `lineup_count`, and `ready_count`.
- `POST /api/events/`: create. Required fields: `title`, `choir_id`, `date`, `start_time`, `end_time`; optional fields: `venue`, `description`, `preparation_deadline`, `status`.
- `GET /api/events/{id}/`: retrieve an owned event and lineup.
- `PATCH /api/events/{id}/`: update supplied event fields.
- `DELETE /api/events/{id}/`: delete the event and its event-song entries (204); reusable songs and materials remain.
- `GET /api/events/{id}/lineup/`: list ordered lineup entries.
- `POST /api/events/{id}/lineup/`: add an owned song with `{ "song_id": 12, "purpose": "opening" }`; `position` is assigned by the server. A song can appear only once per event.
- `POST /api/events/{id}/reorder-lineup/`: reorder the complete lineup with `{ "event_song_ids": [7, 4, 9] }`. The submitted IDs must exactly match the event lineup. Position changes are applied transactionally.
- `GET /api/lineup-items/{id}/`: retrieve an owned lineup entry.
- `PATCH /api/lineup-items/{id}/`: update `purpose`, `assigned_voice_part`, `special_instructions`, `practice_notes`, or `preparation_status`; the song relation cannot be changed after creation.
- `DELETE /api/lineup-items/{id}/`: remove only the event entry (204) and compact the remaining positions.

Event statuses: `upcoming`, `preparing`, `completed`, `cancelled`. Song purposes: `opening`, `worship`, `communion`, `closing`, `special_music`, `other`. Preparation statuses: `not_started`, `learning`, `practiced`, `ready`. End time must be later than start time and deadline must be on or before the event date. Deleting a song still referenced in a lineup returns HTTP 409; remove it from each lineup first.

## Calendar data

The calendar uses the authenticated `GET /api/events/` endpoint and its nested lineup summaries; there is no separate calendar endpoint or calendar-specific stored record. The frontend derives preparation deadline markers and practice reminders from each event's `preparation_deadline` and lineup readiness. Event clicks navigate to event details; practice reminder clicks navigate to the first lineup song not marked Ready.

## Account export and import

All portability endpoints require the authenticated token and operate only on `request.user`.

- `GET /api/auth/export/?type=json` returns a private, no-store JSON download named `choirlineup-export.json`.
- `GET /api/auth/export/?type=zip` returns a private ZIP download containing `manifest.json`, `data.json`, and account-owned `media/` assets.
- `POST /api/auth/import/` accepts multipart fields `file` (JSON or ZIP) and `mode` (`merge` or `replace`). Replace is destructive and should be confirmed in the UI. The server first validates the complete payload and creates an account-only recovery ZIP before replacement.

Format version 1 exports profile name/default voice, choirs, custom categories, reusable songs and choir/category links, attachment metadata and content, events and ordered lineups, and per-user material viewing progress. Email is included for reference, but passwords, tokens, and server configuration are not. ZIP manifests identify `choirlineup-account-zip`, version, creation time, and SHA-256 of `data.json`; media entries also have size and SHA-256 checks. Import limits archives to 512 MiB and 100,000 records/files, rejects unsafe, duplicate, or unexpected paths, and validates media type/content, field limits/choices, dates/times, progress ranges, and all foreign-key-like relationships before changing records.

Merge is additive: matching choir/category names and matching song/event details are reused, existing lineup entries are retained, and matching YouTube links are reused. Uploaded material files are added as separate attachments so distinct content is not discarded. Replace clears only the authenticated user's records and stores a recoverable account snapshot under `BACKUP_ROOT` before applying the validated import. If the database transaction fails, newly written files are removed and deleted pre-import files are restored from that snapshot. The ZIP is an account-scoped structured database export, not a copy of the installation-wide SQLite file.

## Future API areas

Practice Mode uses the existing event and lineup endpoints, while viewing history uses the per-attachment progress endpoints above.
