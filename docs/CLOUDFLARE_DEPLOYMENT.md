# Cloudflare Pages Deployment (Later)

This repository is ready for a later static Cloudflare Pages deployment, but no deployment has been performed. Supabase remains the only backend. No Worker, Pages Function, Wrangler configuration, or Cloudflare database is required.

## Prerequisites

- A Cloudflare account and a GitHub or GitLab repository containing this app.
- A production Supabase project with all eight migrations, `team-admin` deployed, and the initial Founder verified.
- The Supabase project URL and browser-safe anon/publishable key.
- A chosen production branch (`main` below) and, optionally, a custom domain already added to Cloudflare DNS.
- A clean local acceptance run using Node 22.16.0. Never use the service-role key as a Pages variable.

In Cloudflare, open **Workers & Pages > Create application > Pages > Connect to Git**, select the repository, then enter the configuration below. Create a preview deployment first, complete the manual two-account security checks, and only then attach/promote the production domain.

## Exact Pages configuration

Create a Git-connected Pages project later with these values:

| Setting                | Value                                              |
| ---------------------- | -------------------------------------------------- |
| Framework preset       | React (Vite)                                       |
| Production branch      | `main` (or the repository's chosen release branch) |
| Root directory         | `/` or blank when this app is at repository root   |
| Build command          | `npm run build`                                    |
| Build output directory | `dist`                                             |
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

`public/_redirects` contains:

```text
/* /index.html 200
```

Vite copies this file into `dist`. Cloudflare Pages reads `_redirects` from the static output and rewrites an unknown client-side route to `index.html`, allowing `/dashboard`, `/leads`, and other React Router URLs to load after a browser refresh. See <https://developers.cloudflare.com/pages/configuration/redirects/>.

Do not add Pages Functions for routing. Cloudflare notes that `_redirects` rules do not apply to routes served by Pages Functions, and this SPA does not need functions.

## Supabase production settings

Before the first later deployment:

1. Apply all migrations through `202608030008_team_operations.sql` and deploy `team-admin` with JWT verification enabled.
2. Create Noor and Hiba, assign their profile roles, and disable public signup.
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

Confirm `dist/index.html` and `dist/_redirects` exist. After a later deployment, manually verify login, logout, refresh on every client-side route, founder-only URLs, a Hiba delete denial, a stage-history write, and CSV import/export. Do not promote a preview build until those checks pass.
