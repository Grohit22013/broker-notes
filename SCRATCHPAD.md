# BrokerNotes: Scratchpad

The working log for the build. It's updated in every PR and records progress, decisions, open issues, and how AI was used.

---

## Progress

- [ ] **Phase 0: Setup and quality tooling** (`phase-0/setup`)
  - [x] Next.js 15 app scaffold (TypeScript, App Router, Tailwind v4)
  - [x] Prettier (Tailwind class sorting), stricter ESLint and TypeScript rules, Vitest
  - [x] Husky + lint-staged pre-commit hook
  - [x] shadcn/ui components and brand theme (light and dark)
  - [x] Responsive app shell: header on desktop, bottom tab bar on mobile, iOS safe-area padding
  - [x] Prisma 6 schema, database client singleton, `.env.example`
  - [x] GitHub Actions CI and PR template
  - [ ] Neon database connected (`prisma db push`)
- [ ] Phase 1: Authentication
- [ ] Phase 2: Notes core with Tiptap
- [ ] Phase 3: Notes list, search and filters
- [ ] Phase 4: Broker features, plus CSV import and export
- [ ] Phase 5: AI via OpenRouter
- [ ] Phase 6: Polish, README and deploy
- [ ] Phase 7 (stretch): "Ask my notes" agent, email draft, processor role

---

## Decisions log

| Date       | Decision                                                          | Why                                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-28 | Target **Australian** mortgage brokers                            | Research found the hiring group (Stephen Ventures / Carisma) processes loans for AU brokers, and the linked startup Finobi builds AI file notes for AU advisers. ASIC RG 273 makes file notes a compliance need. |
| 2026-11-28 | Postgres on **Neon** with **Prisma 6**                            | Free tier, works well with Vercel, and gives type-safe queries. Prisma 6 keeps the simpler `url`/`directUrl` config.                                                                                             |
| 2026-11-28 | **Next.js 15.5**, not 16                                          | A stable, well-known setup that works with Auth.js v5 and Tiptap.                                                                                                                                                |
| 2026-11-28 | AI through **OpenRouter** (free or cheap models)                  | Keeps cost close to zero. The model is set in env, so it can be swapped without code changes.                                                                                                                    |
| 2026-11-28 | **One structured AI call** per analysis, no agent in the core app | One call is cheaper, faster and more reliable on free models than a multi-step agent. An "Ask my notes" agent stays an optional stretch goal.                                                                    |
| 2026-11-28 | Mobile-first UI with a bottom tab bar on phones                   | Brokers often write notes on the go, between client meetings.                                                                                                                                                    |
| 2026-11-28 | Branch per phase, PR into `main`, and the owner merges            | Every change gets reviewed, and CI must pass before merging.                                                                                                                                                     |
| 2026-11-28 | `next build` without `--turbopack`                                | The webpack production build is the more proven option for deployment.                                                                                                                                           |

---

## Open issues, TODOs and known limitations

- `npm audit` reports issues in the copy of `postcss` that ships inside Next 15. It only runs at build time, on our own CSS, so the risk is low. Fixing it needs Next 16 (a breaking upgrade), so it's deferred and will be reviewed before deploy.
- The dev machine's C: drive ran out of space during setup. Clearing the npm cache freed about 1.8 GB. Consider `npm config set cache D:\npm-cache`.
- `/notes/new` shows a 404 until Phase 2.

---

## AI usage log

The app is built with Claude Code (Claude Opus 5.5) as a pair programmer. The human sets direction and reviews every PR. The AI researches, plans and writes code.

| Phase    | Prompt or intent                                                                                         | What the AI did                                                                                                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planning | "Research mortgage broker features, plus Stephan Ventures and Finobi, using separate agents"             | Ran 3 parallel research agents (broker workflow and compliance, Stephen Ventures / Carisma, Finobi), then combined their findings into the Australian-broker, compliance-first product direction.              |
| Planning | "Break this phase by phase, use the GitHub PR workflow, OpenRouter, keep it mobile friendly, handle CSV" | Wrote the phased plan with "done when" criteria, the branch and PR workflow, the code-quality setup, the mobile-first layout rules, and the CSV import/export design (including formula-injection protection). |
| 0        | "Start Phase 0"                                                                                          | Scaffolded the app and set up the tooling, theme, app shell, Prisma and CI. Kept `main` limited to the README so the scaffold could be reviewed in a PR.                                                       |
