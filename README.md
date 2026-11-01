# ChoirLineup

ChoirLineup is an open-source, self-hostable workspace for singers who take part in multiple choirs. The current release includes personal workspace, song library, event lineups, Practice Mode, a preparation calendar, and account-scoped JSON/ZIP backup and restore.

## Features available now

- Separate React and Django REST Framework applications.
- Account registration with full name, email, voice classification, and password confirmation.
- Email/password sign-in and token-based sign-out.
- Authenticated profile read/update endpoint.
- Profile picture upload and removal with image validation and authenticated private delivery.
- Personal choir create, edit, list, and delete, including choir colors and choir-specific voice parts.
- Reusable personal song library with choir assignments, custom categories, search, filters, and sorting.
- Private PDF, image, and video uploads plus validated YouTube links for song learning materials.
- Choir events with preparation deadlines, statuses, venues, and song readiness summaries.
- Ordered event lineups with drag-and-drop reordering, event-specific voice parts and notes, and song creation from an event.
- Event-based Practice Mode with song navigation and manual preparation statuses.
- In-app PDF, image-page, uploaded-video, and YouTube learning viewers, with private per-account viewing progress.
- Drag-and-drop image-page ordering saved to the server.
- Calendar month, week, day, and agenda views, with choir colors, preparation deadlines, and practice reminders.
- Dashboard, responsive navigation, light/dark theme, week-start preference, and dashboard section controls.
- Account-only JSON export/import and complete ZIP backup/restore with media, validation, merge/replace behavior, and a recovery backup before replacement.
- Native Windows and Linux launch/stop scripts with tracked processes, dependency setup, safe migrations, and local built-preview mode.
- SQLite database stored under `data/` by default.
- Localhost-only development defaults.

## Screenshots

Screenshots will be added as the product workflows mature.

## Technology

- React, TypeScript, Vite, React Router, FullCalendar, Axios, React Hook Form, Tailwind CSS, Lucide React
- Python, Django, Django REST Framework, Pillow for image validation
- SQLite

## Requirements

- Python 3.11 or newer (Python 3.12 is a good default).
- Node.js 20 or newer and npm.
- Git, if cloning the source repository.

## Quick start (Windows)

Open PowerShell in the cloned project folder:

```powershell
py -3 -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
Copy-Item .env.example .env
python backend\manage.py migrate
```

In a second PowerShell window, install and start the frontend:

```powershell
cd frontend
npm install
npm run dev
```

Start the backend in the first window:

```powershell
python backend\manage.py runserver 127.0.0.1:8000
```

## Quick start (Linux)

From the cloned project folder:

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install -r backend/requirements.txt
cp .env.example .env
python backend/manage.py migrate
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Start the backend in the first terminal:

```bash
python backend/manage.py runserver 127.0.0.1:8000
```

Open <http://127.0.0.1:5173>. Use **Create an account** to register. Add choirs from the dashboard or **My choirs**; each can have its own voice classification and color. **Song library** lets you create reusable songs, assign them to choirs, add custom categories, search and filter your repertoire, and manage learning materials. **Events** lets you create choir performances and rehearsals, set deadlines, add songs, drag songs into performance order, and record event-specific instructions, personal practice notes, and readiness. Open an event and select **Practice lineup**, or choose an active event from **Practice**, to work through its songs in order. Update each song's preparation status, review its notes, and open its learning materials in the page. Use the image-page arranger to reorder uploaded sheet pages. Optional automatic navigation moves to the next song when you mark the current song Ready. Your PDF/image page and uploaded-video/YouTube position are saved per account and restored on return. **Calendar** shows choir-colored events in month, week, day, and agenda views; it also marks preparation deadlines and reminders for songs not yet Ready. **Settings** contains appearance, calendar, dashboard, and data portability controls. The API is at <http://127.0.0.1:8000/api/>. Development servers are for local development only.

## Native launchers

The native launchers prepare dependencies on first use, apply Django migrations, and start both services. They keep PID records and logs under the ignored `data/` folder. They never delete or reset the SQLite database.

Windows, from the project folder:

```bat
scripts\start-windows.bat
```

Linux, from the project folder:

```bash
./scripts/start-linux.sh
```

Open <http://127.0.0.1:5173> if the browser does not open automatically. Stop only the processes started by ChoirLineup with `scripts\stop-windows.bat` on Windows or `./scripts/stop-linux.sh` on Linux. Review `data/logs/` if startup fails. Startup refuses to use a port that is already occupied and will not stop the process using it.

Append `--built` to build the frontend and serve it locally in Vite preview mode. Preview still uses Django's development server, so neither launcher mode is suitable for public Internet production. The default bind address is localhost. `--host 0.0.0.0` can expose the app to your local network; configure `DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ALLOWED_ORIGINS`, and `VITE_API_BASE_URL` in `.env` for the machine's LAN address and firewall first. Do not expose Django's development server to the public Internet. Use `--no-browser` to skip opening a browser. `DJANGO_PORT` and `VITE_PORT` in `.env` select the service ports.

## Configuration

Copy `.env.example` to `.env`. Django loads simple `KEY=value` entries and does not override environment variables already set by the operating system.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | development placeholder | Set a private, random value before any shared deployment. |
| `DJANGO_DEBUG` | `true` | Set `false` outside local development. |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated Django hosts. |
| `DJANGO_BIND_HOST` | `127.0.0.1` | Suggested bind address; used in manual run command. |
| `DJANGO_PORT` | `8000` | Suggested backend port. |
| `VITE_PORT` | `5173` | Frontend port used by native launchers. |
| `DJANGO_CORS_ALLOWED_ORIGINS` | local Vite origins | Comma-separated browser origins permitted to call the API. |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | empty | HTTPS origins trusted by Django's CSRF middleware, comma-separated. |
| `DJANGO_SECURE_SSL_REDIRECT` | `true` when `DJANGO_DEBUG=false` | Redirect HTTP requests to HTTPS. Set based on your TLS/reverse-proxy setup. |
| `DJANGO_SESSION_COOKIE_SECURE` | follows `DJANGO_DEBUG` | Send Django session cookies only over HTTPS in production. |
| `DJANGO_CSRF_COOKIE_SECURE` | follows `DJANGO_DEBUG` | Send Django CSRF cookies only over HTTPS in production. |
| `DJANGO_TRUST_X_FORWARDED_PROTO` | `false` | Trust a reverse proxy's `X-Forwarded-Proto` header; enable only if that proxy overwrites the header. |
| `DJANGO_SECURE_HSTS_SECONDS` | `0` | HSTS duration. Enable only after HTTPS is confirmed for the hostname. |
| `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS` | `false` | Include all subdomains in HSTS; use only if each subdomain supports HTTPS. |
| `DJANGO_SECURE_HSTS_PRELOAD` | `false` | Opt into browser preload lists; understand the long-lived domain-wide effect before enabling. |
| `SQLITE_PATH` | `data/db/db.sqlite3` | SQLite file path, relative to repository root unless absolute. |
| `MEDIA_ROOT` | `data/media` | Local uploaded media path. |
| `BACKUP_ROOT` | `data/backups` | Private destination for recovery backups created before replace imports. |
| `CHOIRLINEUP_MAX_ATTACHMENT_MB` | `100` | Maximum size for one uploaded song learning material. |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000/api` | Frontend API base URL at build time. |

## Development

Backend commands, from the repository root with the virtual environment active:

```bash
python backend/manage.py check
python backend/manage.py test accounts choirs songs events
python backend/manage.py makemigrations
python backend/manage.py migrate
```

Frontend commands:

```bash
cd frontend
npm install
npm test
npm run dev
npm run build
```

The initial custom account migration is included. Do not remove `data/db/db.sqlite3` as a way to resolve migration issues; it may contain user data.

## Authentication API

- `POST /api/auth/register/`: register and return `{token, user}`.
- `POST /api/auth/login/`: authenticate and return `{token, user}`.
- `POST /api/auth/logout/`: delete the current token.
- `GET/PATCH /api/auth/profile/`: retrieve or update the authenticated user's own profile.

Send the token as `Authorization: Token <token>`. Passwords are stored using Django's password hashing framework. Registration uses Django's configured password validators.

## Import, export, and backups

Open **Settings → Data portability** to download a JSON export or ZIP backup. JSON export includes your personal data and attachments. ZIP also contains a versioned manifest, integrity checks, and media files. Import accepts either format and offers **Merge** or **Replace**. Merge adds records and reuses matching choir/category/song/event details; matching YouTube links are reused and uploaded files are retained as attachments. Replace first creates a recoverable account-only ZIP in `data/backups/` (or `BACKUP_ROOT`), then replaces your personal workspace. It does not replace the installation database or affect other accounts. Store downloaded and recovery backups somewhere private. For installation-level disaster recovery, operators should back up the SQLite database and media directory together while the application is stopped.

## Network and production security

The development backend and Vite server are not production servers. Defaults bind to loopback. To allow local network or Internet access, operators must configure `ALLOWED_HOSTS`, frontend origin/CORS and CSRF rules, HTTPS, secret management, a production WSGI/ASGI server, static asset serving, firewall rules, and database/media backups. With `DJANGO_DEBUG=false`, HTTPS redirects and secure-only Django session/CSRF cookies default on. If TLS terminates at a reverse proxy, configure that proxy to overwrite `X-Forwarded-Proto` before enabling `DJANGO_TRUST_X_FORWARDED_PROTO`. HSTS remains off until explicitly configured; enable it only after confirming HTTPS for the complete hostname, and use subdomain/preload flags only when appropriate. Token authentication currently has no expiry or refresh flow; review this before exposing an installation beyond localhost. Never use the development secret in a shared deployment.

## Troubleshooting

- **The page says it cannot connect:** start Django at port 8000 and check `VITE_API_BASE_URL`.
- **Registration fails on a short/common password:** Django's built-in password validators reject it; choose a longer, less common password.
- **Database directory error:** ensure the account can write to the directory containing the configured SQLite path.
- **Port is already in use:** stop the other development server or choose another port and update the frontend API URL.
- **The launcher reports a port conflict:** stop the service using that port yourself, or configure different `DJANGO_PORT` and `VITE_PORT` values. The launcher will not terminate unrelated processes.
- **The page cannot reach the API:** check the logs in `data/logs/` and confirm `VITE_API_BASE_URL` points to the Django host and port.

## Contribution and license

See [CONTRIBUTING.md](CONTRIBUTING.md). ChoirLineup is licensed under the [MIT License](LICENSE).
