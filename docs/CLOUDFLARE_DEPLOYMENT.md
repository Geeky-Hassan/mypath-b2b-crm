# Cloudflare Pages Deployment

This repository is ready for a static Cloudflare Pages deployment. Supabase remains the only backend. No Worker script, Pages Function, Wrangler configuration, or Cloudflare database is required.

## Prerequisites

- A Cloudflare account and a GitHub or GitLab repository containing this app.
- A production Supabase project with all 12 migrations, `team-admin` deployed, and the initial Founder verified.
- The Supabase project URL and browser-safe anon/publishable key.
- A chosen production branch (`main` below) and, optionally, a custom domain already added to Cloudflare DNS.
- A clean local acceptance run using Node 22.16.0. Never use the service-role key as a Pages variable.

In Cloudflare, open **Workers & Pages > Create application > Pages > Connect to Git**, select the repository, then enter the configuration below. Create a preview deployment first, complete the manual two-account security checks, and only then attach/promote the production domain.

Do not configure `npx wrangler deploy` as a Pages deploy command. Pages deploys the `dist` directory automatically after the build succeeds. A log line saying `Executing user deploy command: npx wrangler deploy` means the repository was connected to **Workers Builds**, not to a Git-connected **Pages** project.

## Exact Pages configuration

Create a Git-connected Pages project later with these values:

| Setting                | Value                                              |
| ---------------------- | -------------------------------------------------- |
| Framework preset       | React (Vite)                                       |
| Production branch      | `main` (or the repository's chosen release branch) |
| Root directory         | `/` or blank when this app is at repository root   |
| Build command          | `npm run build`                                    |
| Build output directory | `dist`                                             |
| Deploy command         | None; Pages deploys the build output automatically |
| Build system           | Current Pages build system                         |
| Node version           | `22.16.0`, pinned by `.node-version`               |

Cloudflare's current Pages build documentation lists `npm run build` and `dist` for React (Vite): <https://developers.cloudflare.com/pages/configuration/build-configuration/>.

## Build environment variables

Add both values to **Production** and **Preview** build environments:

```text
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

These values are compiled into the browser bundle and are intentionally public. RLS is the security boundary. Never configure `SUPABASE_SERVICE_ROLE_KEY`, a database password, or any other privileged credential in this frontend project.

The checked-in `.node-version` pins Node consistently. If the Pages project does not honor that file, add `NODE_VERSION=22.16.0` as a build variable. Cloudflare documents Node selection through `.node-version` or `NODE_VERSION`: <https://developers.cloudflare.com/pages/configuration/build-image/>.

## SPA refresh routing

Do not add `/* /index.html 200` to `public/_redirects`. Cloudflare Pages natively treats a deployment with a top-level `index.html` and no top-level `404.html` as a single-page application. Unknown navigation paths are served by the SPA shell, allowing `/dashboard`, `/leads`, and other React Router URLs to load after a browser refresh. See <https://developers.cloudflare.com/pages/configuration/serving-pages/>.

The catch-all `_redirects` rule is also incompatible with a Workers Static Assets deployment that already has `assets.not_found_handling = "single-page-application"`; Wrangler rejects that combination as an infinite loop with API error `100324`. This repository intentionally omits that redundant file.

Do not add Pages Functions for routing. This SPA does not need them.

## If the project was created under Workers Builds

The application build can succeed and still fail afterward if Cloudflare runs `npx wrangler deploy`. That is a deployment-mode issue, not a Vite failure.

Recommended correction:

1. Create a new **Pages > Connect to Git** project for this repository.
2. Use `npm run build` and `dist` as shown above.
3. Leave the deploy command empty.
4. Add the two `VITE_` variables to both Production and Preview.
5. Deploy the `main` branch.

If you intentionally keep Workers Static Assets instead, its SPA configuration must use `assets.not_found_handling = "single-page-application"`; do not re-add the catch-all `_redirects` file. Cloudflare documents that Workers configuration at <https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/>.

## Supabase production settings

Before the first later deployment:

1. Take a database backup, validate score counts, apply all migrations through `202608050012_reliability_and_lead_workflow.sql`, and deploy `team-admin` with JWT verification enabled.
2. Create Noor as the initial Founder, then create Lead Generators from CRM Settings; disable public signup.
3. Set the Supabase Auth **Site URL** to the final production origin, such as `https://crm.example.com`.
4. Add the exact `*.pages.dev` and custom-domain origins to Auth redirect URLs only if a future version adds confirmation, recovery, magic-link, or OAuth flows. V1 password sign-in does not use redirect-based authentication.
5. Keep the anon/publishable key in Pages build variables and keep all privileged keys out of the site.

The Edge Function runs on Supabase, not Cloudflare. Do not add its server secrets
to Pages. Cloudflare still needs exactly the two `VITE_` variables above.

## Pre-deployment gate

Run locally against a non-production Supabase project:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Confirm `dist/index.html` exists and `dist/_redirects` does not. After deployment, manually verify silent session refresh, unsaved form retention, founder-only URLs, safeguarded deletion as both roles, Ready for Founder labels, 0–11 scores, top pipeline scrolling, a stage-history write, and CSV import/export. Do not promote a preview build until those checks pass.
