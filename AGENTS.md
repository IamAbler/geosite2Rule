# Repository Guidelines

## Project Structure & Module Organization

`src/index.js` is the Cloudflare Worker entry point. It selects data sources, routes API requests, caches responses, and renders rule sets. Parsing and encoding live in `src/geosite.js`, `src/geoip.js`, `src/protobuf.js`, and `src/mrs.js`. The Vue interface lives in `frontend/App.vue`, with setup in `frontend/main.js` and styles in `frontend/style.css`. Vite builds the interface into `dist/`, which is committed because Cloudflare Git deployments may serve the checked-in assets. `wrangler.jsonc` contains Worker configuration.

## Build, Test, and Development Commands

- `npm install`: install dependencies from `package-lock.json`.
- `npm run build`: compile the Vue interface into `dist/`.
- `npm run dev`: build assets and start a local Wrangler Worker.
- `npm run preview`: build and create a Cloudflare preview deployment.
- `npm run deploy`: build and deploy the production Worker; use only when deployment is intended.

There is currently no test or lint script. Do not claim automated coverage. For a change, check the affected API response or interface behavior manually, and run the build when front-end assets change.

## Coding Style & Naming Conventions

Use two-space indentation, ES modules, double-quoted JavaScript strings, and semicolons, matching existing code. Use `camelCase` for variables and functions, and descriptive lowercase route segments such as `/rules/sing-box/`. Keep format-specific conversion in the Worker and selection or presentation logic in Vue. Follow existing Fluent UI component usage and keep visible interface copy brief.

## Commit & Pull Request Guidelines

Recent commits use short, imperative English subjects, for example `Add V2Fly and custom data sources`. Keep each commit focused. Include regenerated `dist/` assets with front-end changes. In pull requests, describe the behavior change, list affected formats or endpoints, and include a desktop or mobile screenshot for visible UI changes. Mention any conversion limitations, such as skipped rule types.

## Security & Configuration

Keep source URLs public HTTPS URLs and preserve the Worker’s URL validation and 32 MiB download limit. Do not commit credentials. Configure default source URLs in `wrangler.jsonc`; document any new environment bindings in `README.md`.
