# Database schema

## Implemented

### User (`accounts_user`)

Custom Django `AbstractUser` with username removed and email as the unique login field. Includes Django authentication fields, unique email, `full_name`, `default_voice` (`soprano`, `alto`, `tenor`, `bass`, `custom`), and optional `profile_picture`. Passwords use Django's password hashers.

Profile pictures are stored under `MEDIA_ROOT/profile_pictures/<user-id>/` with a random filename. The API accepts JPEG, PNG, and WebP up to 5 MB and 6000 pixels per side / 25 megapixels total. The database stores only its relative storage name; access goes through an authenticated view scoped to the requesting user.

### Choir (`choirs_choir`)

Fields: `user` (required FK to User, cascade), `name` (120 chars), `description`, `color` (six-digit hex), `voice_classification` (`soprano`, `alto`, `tenor`, `bass`, `custom`), `custom_voice` (up to 60 chars), `created_at`, and `updated_at`. Names are unique per account, with an API case-insensitive duplicate check. Index on `(user, name)`. Querysets always filter by the authenticated user. Deleting a choir removes its song links but leaves reusable songs and their materials intact.

### SongCategory (`songs_songcategory`)

Belongs to one user. Fields: `name` (60 chars) and `created_at`; unique `(user, name)`. Categories are personal and cannot be applied across accounts.

### Song (`songs_song`)

Belongs to one user. Fields: `title` (180 chars), `composer_artist` (180 chars), `language` (60 chars), `musical_key` (24 chars), `description`, optional `voice_classification`, `categories` (many-to-many to SongCategory), `choirs` (many-to-many through SongChoir), and timestamps. Index `(user, title)`. One record can be connected to multiple owned choirs.

### SongChoir (`songs_songchoir`)

Through table linking a reusable song and a choir, unique `(song, choir)`. API validation restricts both relations to the authenticated user's records. Deleting a choir removes only its links; deleting a song removes its links.

### SongAttachment (`songs_songattachment`)

Belongs to one song, which owns it. Fields: `kind` (`pdf`, `image`, `youtube`, `video`), `title`, optional private `file`, optional validated YouTube `url`, `position`, and `created_at`. Index `(song, position)`. File names are randomized on storage; uploads live under `song_materials/<user-id>/<song-id>/`. File content and extension are checked and the configurable per-file limit defaults to 100 MB. Deleting an attachment or song removes its stored file. Private file responses are authenticated and use `Cache-Control: private, no-store`.

### MaterialViewingProgress (`songs_materialviewingprogress`)

Belongs to one user and one SongAttachment. Fields: `last_page` (positive integer, default 1), `video_position` (decimal seconds, default 0), and `updated_at`. Unique `(user, attachment)` permits one progress record per user's view of each material. The API verifies the attachment's song belongs to the authenticated user; progress is never written onto the reusable Song or attachment itself. Deleting an attachment cascades its viewing progress.

## Constraints and ownership

Profile queries resolve directly to `request.user`; clients cannot supply a user ID to select another profile. Choir create operations assign `user` from `request.user`, and all choir viewsets filter by that user. Other users' choir IDs return 404. Later user-owned models must be linked directly or through a parent with enforced ownership checks and documented deletion rules.

### Event (`events_event`)

Belongs to one user and exactly one choir. Fields: `title` (180 chars), `date`, `start_time`, `end_time`, `venue`, `description`, optional `preparation_deadline`, `status` (`upcoming`, `preparing`, `completed`, `cancelled`), and timestamps. Index `(user, date)`, ordered by date/time/id. API creation assigns `user` from the authenticated request and restricts `choir` to the current user's choirs. End time must follow start time; preparation deadline cannot follow event date. Deleting an event cascades only its lineup entries.

### EventSong (`events_eventsong`)

Links one event to one reusable Song. Fields: `position`, `purpose` (`opening`, `worship`, `communion`, `closing`, `special_music`, `other`), `assigned_voice_part`, `special_instructions`, `practice_notes`, and `preparation_status` (`not_started`, `learning`, `practiced`, `ready`). Unique `(event, song)` prevents duplicates; unique `(event, position)` protects ordering. The API scopes entries through `event__user=request.user` and restricts selected songs to the current user. Deleting an entry compacts positions; song deletion is protected while any event lineup references it.

## Planned entities

Calendar reminder records. Image pages currently use SongAttachment records with kind `image`, and their relative order is persisted in `position`.

## Account portability snapshot

Portability does not add database tables. Export takes an account-scoped snapshot of the profile (excluding credentials), choirs, categories, songs and their relationships, attachments, events and ordered lineups, and material viewing progress. Source primary keys are import-local relationship keys; restore creates new IDs and never accepts an owner ID. ZIP media paths are logical members and are never used as storage paths. Before replace, the server writes an account-only recovery ZIP under `BACKUP_ROOT` (default `data/backups/`). It contains the structured account export rather than the installation-wide SQLite database, so another account's records cannot be included.
