# Contributing

Thanks for helping improve ChoirLineup. Read `AGENTS.md` and the relevant architecture, API, schema, and progress documents before making changes. The project is being developed in phases; keep pull requests focused on one phase or a small, reviewable part of it.

## Local setup

Follow the Windows or Linux setup in `README.md`. Backend checks are run with `python backend/manage.py check` and `python backend/manage.py test accounts choirs songs`. Frontend interaction tests and production compilation are `npm test` and `npm run build` from `frontend/`.

## Change expectations

- Enforce ownership and validation on the server.
- Add tests for behavior and security boundaries when implementing features.
- Update API/schema/setup documentation when applicable.
- Update `docs/DEVELOPMENT_PROGRESS.md` and `docs/CHANGELOG.md` for completed work.
- Do not commit `.env`, databases, uploaded files, virtual environments, `node_modules`, or build output.
- Describe tested commands and actual outcomes in the pull request.

## Reporting issues

Include the operating system, Python and Node versions, steps to reproduce, expected behavior, actual behavior, and relevant sanitized logs. Never include passwords, tokens, secret keys, or personal database/media files.
