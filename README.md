# SIM Racing NG — Website

React + TypeScript + Vite + Tailwind CSS v4, with client-side routing via React Router.

## Getting started

```bash
npm install
npm run dev       # starts the dev server
npm run build     # type-checks and builds for production (outputs to dist/)
npm run preview   # serves the production build locally
```

## Structure

```
src/
  components/common/   Navbar, Footer, Layout, SRNLogo, PageHeader — shared across pages
  data/                Mock content: members, news, rigs, activities, merch, games
  pages/               One file per route
  theme.ts             Brand color constants (electric green / orange)
  App.tsx              Route definitions
```

## Pages & routes

| Page | Route |
| --- | --- |
| Home | `/` |
| Game Gallery | `/gallery` |
| Community Activities | `/activities` |
| News | `/news` and `/news/:slug` |
| About Us | `/about` |
| Member Directory | `/members` and `/members/:id` |
| Sim Rigs | `/rigs` and `/rigs/:id` |
| Media Hub | `/media` |
| Merchandise | `/shop` |
| Contact | `/contact` |

## Current status

All pages run on **mock data** in `src/data/`. Forms (contact, activity submission, rig
submission, newsletter) show a success state on submit but don't send anywhere yet —
they're ready to be wired to a backend (e.g. Supabase, or a Vercel serverless function,
same pattern as the merch store / newsletter on the live site).

Nothing here talks to Supabase or any other backend yet — swap the mock data imports in
`src/data/` for real fetches once the schema is ready.
