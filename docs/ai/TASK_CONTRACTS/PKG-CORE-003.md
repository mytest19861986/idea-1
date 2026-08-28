# PKG-CORE-003 — Source registry domain core

## Objective

Create a dependency-free, deterministic domain core for evaluating source candidates and controlling source lifecycle states.

## In scope

- Source lifecycle state definitions and allowed transitions.
- Deterministic source-quality evaluation from supplied criteria.
- Admission decision that never activates an unknown source automatically.
- Automated tests for the domain invariants.

## Out of scope

- Database persistence, migrations, network collection, crawling, AI calls, web UI, Telegram delivery, or production activation.

## Acceptance criteria

- A candidate with insufficient evidence cannot be approved.
- An approved candidate is still not automatically active.
- Invalid lifecycle transitions fail closed.
- Scores and decisions are deterministic for identical input.
