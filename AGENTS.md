# Repository Guidelines

## Scope: English mobile only

All work by any agent in this repository is for the English mobile (Android)
version of Football Trivia Battle. Unless the user explicitly overrides this
for a specific task:

- **No translations.** Do not add, edit or translate anything in
  `src/services/i18n/messages/{es,fr,de,it}.ts`. New UI text is written as
  plain English string literals in the component, not added to the i18n
  catalogues (adding a key to `en.ts` forces every locale to change). Existing
  `t()` calls stay as they are. This overrides any plan doc that says new
  strings go through the i18n table.
- **No web-exclusive work.** Do not build, fix, deploy or optimise anything
  that only affects the web/desktop build (hosted web deploys, desktop-only
  layout, browser-only code paths). Shared code is fine; verify on mobile.

## Project Structure & Module Organization

The Vite + React client lives in `src/`. Organize UI by feature under
`src/features/<feature>/`, reusable game rules in `src/game/`, integrations in
`src/services/`, shared models in `src/types/`, and static media in
`src/assets/`. Keep client tests beside their area in `__tests__/` directories.

The WebSocket multiplayer service and its tests are in `server/`.
Database migrations and Supabase Edge Functions belong in `supabase/`; Android
packaging is managed through `android/` and Capacitor. `public/` is served
unchanged, while `Plans/` and `docs/` hold documentation.

## Build, Test, and Development Commands

- `npm run dev` starts the Vite client at `http://localhost:5173`.
- `npm run dev:server` starts the local multiplayer WebSocket server.
- `npm run test` runs the Vitest suite once; use `npm run test:watch` while
  developing.
- `npm run typecheck` checks TypeScript without emitting files.
- `npm run lint` runs Oxlint; `npm run build` type-checks and writes the
  production client bundle to `dist/`.
- `npm run cap:sync` builds and syncs web assets into the Android project.

Run the client and server together when changing multiplayer behavior.

## Coding Style & Naming Conventions

Use TypeScript throughout. Match the existing style: two-space indentation,
single quotes, no semicolons, and trailing commas.
Use `PascalCase` for React components and type names; use `camelCase` for
functions, variables, stores, and file names such as `localSocket.ts`. Keep
pure game rules in `src/game/` so they remain shareable by client and server.
Follow the configured React and TypeScript Oxlint rules; do not leave unused
locals or parameters.

## Testing Guidelines

Vitest runs in a JSDOM environment with Testing Library available for UI
tests. Name test files `*.test.ts` or `*.test.tsx` and place them in the
nearest `__tests__/` folder, for example
`src/features/match/__tests__/store.test.ts`. Test user-visible component
behavior and game/server rule outcomes, including error and boundary cases.
Add a failing focused test before changing behavior, then run its file and the
full `npm run test` suite before submitting.

## Commit & Pull Request Guidelines

Use short, imperative commit subjects. Recent history uses conventional
prefixes such as `feat:`, `fix:`, and `refactor:`; add a scope when it clarifies
the affected area (for example, `fix(listing): correct privacy claims`).

Pull requests should explain the behavior change, list verification commands,
link related issues or plans, and include screenshots or recordings for visual
or gameplay changes. Call out environment or deployment changes, such as
`VITE_WS_URL` or `ALLOWED_ORIGINS`; never commit local `.env` secrets.
