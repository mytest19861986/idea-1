# Project

## Status

Foundation in progress. The configured remote is `https://github.com/mytest19861986/idea-1.git` and currently has no commits or refs.

## Product objective

Build a global opportunity intelligence platform that discovers and evaluates information sources, collects and normalizes evidence, analyzes opportunities, applies deterministic scoring, ranks results, and publishes to web and Telegram surfaces.

## Repository truth (2026-08-28)

- Local branch: `main` (unborn; no commits)
- Remote: `origin` → `https://github.com/mytest19861986/idea-1.git`
- Existing source, configuration, tests, CI, infrastructure, and secrets: none observed
- Available local tooling: Git plus bundled Node.js and pnpm supplied by the workspace runtime
- System PATH does not expose `node` or `npm`; project commands must use the bundled runtime until a project toolchain is configured

## Delivery principles

- Keep source admission governed: discovery does not imply production activation.
- Keep scoring deterministic and reproducible in application code.
- Record evidence and provenance for every published opportunity.
- Treat credentials, source access policies, and messaging credentials as secret material.
- Prefer a modular monolith until operational evidence justifies separation.

## Current persistence boundary

The first persistence adapters are local JSON stores for development only. They write complete snapshots atomically and append audit events. They are not multi-process or production database solutions. Commander has selected a PostgreSQL adapter behind a persistence abstraction for future authoritative delivery state.
