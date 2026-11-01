# ChoirLineup contributor instructions

Read this file and the relevant files in `docs/` before changing the application. Work on one development phase at a time and inspect existing code before editing. Keep the React frontend and Django REST API separate; enforce all private data ownership in the backend. Validate inputs on the server, keep secrets and runtime data out of git, and update `docs/DEVELOPMENT_PROGRESS.md` and `docs/CHANGELOG.md` after feature work. Update architecture, schema, API, or setup docs whenever the corresponding implementation changes. Run only the relevant checks and report their actual results. Do not claim incomplete work is finished.

## Current architecture

- `backend/`: Django project with Django REST Framework, SQLite, token authentication, and the `accounts`, user-owned `choirs`, reusable songs/private materials/viewing progress, and `events` apps.
- `frontend/`: React + TypeScript + Vite application.
- `.env.example`: configuration reference; keep real secrets in an untracked `.env`.
- `data/`: runtime database and media; never commit user data.

## Development conventions

- Python dependencies are listed in `backend/requirements.txt`.
- Frontend dependencies and scripts are declared in `frontend/package.json`.
- Use migrations for model changes; never delete or reset the user database as a setup shortcut.
- API routes are under `/api/`; authentication is currently DRF token authentication.
- The frontend reads `VITE_API_BASE_URL` and stores the API token in browser local storage.
- Keep defaults bound to localhost. Review host, CSRF, CORS, and cookie settings before any network deployment.

## Phase status

Phases 1–7 are complete. Phase 8 includes native Windows/Linux start/stop launchers; Linux execution is verified, while Windows execution remains unverified. Phase 9 quality assurance is in progress. Check `docs/DEVELOPMENT_PROGRESS.md` for current verified status and test results.
