# Setup guide

See the complete beginner-oriented Windows and Linux commands in the repository [README](../README.md). This document records setup details that affect the application:

1. Install Python 3.11+ and Node.js 20+.
2. Create and activate a virtual environment in `backend/.venv`.
3. Install `backend/requirements.txt`.
4. Copy `.env.example` to `.env`; change `DJANGO_SECRET_KEY` before any shared deployment.
5. Run `python backend/manage.py migrate` to create/update the configured database. Pillow (for image verification) is installed with `backend/requirements.txt`.
6. Run the Django development server on `127.0.0.1:8000`.
7. Run `npm install` and `npm run dev` in `frontend/`; browse to `http://127.0.0.1:5173`.

## Native launchers

After cloning, Windows users can run `scripts\start-windows.bat` and Linux users can run `./scripts/start-linux.sh` from the project root. On first use the launcher creates `backend/.venv` if needed, installs Python/frontend dependencies when their manifests change, runs `python backend/manage.py migrate --noinput`, then starts the backend and Vite frontend. The browser opens automatically when possible. Use `--no-browser` to skip it, `--host ADDRESS` to select an address, or `--built` to build and serve the frontend in local Vite preview mode. Stop with `scripts\stop-windows.bat` or `./scripts/stop-linux.sh`.

The launchers store process IDs in `data/run/` and logs in `data/logs/`. Linux logs include both standard output and errors; Windows writes separate `*-error.log` files. If startup fails, read those logs. The launchers refuse occupied ports rather than stopping the service that owns them. Set `DJANGO_PORT` and `VITE_PORT` in `.env` to choose different ports. `--built` is a local preview only; Django still runs its development server. Use a production application server and HTTPS for Internet deployment.

Run backend checks from the repository root with the virtual environment active: `python backend/manage.py check`, `python backend/manage.py makemigrations --check --dry-run`, and `python backend/manage.py test accounts choirs songs events`. Run frontend interaction tests from `frontend/` with `npm test`; build the production bundle with `npm run build`.

When updating an existing installation, run `python backend/manage.py migrate`. The Phase 5 migration adds per-user material viewing progress; it does not reset the database.

Account exports and backups are available in **Settings → Data portability**. ZIP and JSON exports contain one account's data and media only. Before replacing account data, ChoirLineup creates a recovery ZIP under `data/backups/` (or `BACKUP_ROOT` if configured). Include that folder in the operator's normal storage backup plan; do not serve it publicly.

The development servers and built preview are for local testing. `CHOIRLINEUP_MAX_ATTACHMENT_MB` controls the maximum size of a single song material upload (default 100 MB); profile pictures have a separate 5 MB limit. Internet deployment requires a production WSGI/ASGI server, HTTPS, restricted allowed hosts/origins, secure secret handling, persistent data backups, and safe static/media serving. The native launchers do not provide production packaging or a production server.

When `DJANGO_DEBUG=false`, HTTPS redirect and secure-only Django session/CSRF cookies default on. If HTTPS terminates at a reverse proxy, enable `DJANGO_TRUST_X_FORWARDED_PROTO` only when that proxy overwrites the forwarded protocol header. HSTS is opt-in; configure it only after confirming HTTPS works for the full hostname. Leave subdomain and preload options off unless every affected hostname is HTTPS-ready.
