# Quick Start

Fast setup for local development.

## 1) Prerequisites

- Bun installed
- `.dev.vars.development` configured
- Local SQLite snapshot available (if using `CONNECTOR=sqlite-dev`)

## 2) Install Dependencies

```bash
bun install
```

## 3) Run Dev Server

```bash
bun run dev
```

App runs with Astro dev mode.

## 4) Build and Preview (Cloudflare-style)

```bash
bun run build
bun run preview
```

## 5) Run Tests

```bash
bun run test
```

Force full re-run:

```bash
bun run test-force
```

## 6) Useful DB Commands

Run a query (development DB):

```bash
bun run query --dev --q "SELECT 1"
```

Replicate snapshot artifacts:

```bash
bun run db:replicate
```

## 7) Optional Local Worker Services

Start PDF worker container:

```bash
bun run docker:pdf
```

Start image-compression worker container:

```bash
bun run docker:img
```

## Notes

- Use Bun commands throughout (`bun run ...`, `bun test ...`).
- Main API entrypoint is `src/pages/api/[...slug].ts`.
- Full project documentation: `README.md`.
