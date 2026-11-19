---
name: milestone
description: Start or resume a build milestone from docs/10-build-plan.md (M1 to M7, or an R2 or R3 item) in plan mode, with the right documents loaded.
argument-hint: [milestone, e.g. M3]
disable-model-invocation: true
---

We are working on milestone $ARGUMENTS.

1. Read `CLAUDE.md`, `docs/README.md`, `docs/decisions.md`, the $ARGUMENTS section of `docs/10-build-plan.md`, and every document that section names or depends on (see the "Read before" column in `docs/README.md`).
2. Check what already exists in the repository for this milestone, so finished work is not redone.
3. List every **Open** decision and every missing input (`docs/09-content-and-inputs.md`) that this milestone depends on. Ask me about them before planning the parts they affect; plan everything else around them with placeholders or feature flags.
4. Work in plan mode. Propose the change list as small pull requests, each a vertical slice that runs with tests: files, packages with pinned versions, migrations, collections and access rules, jobs, tests, and how each slice meets the milestone's "Done when". Wait for my approval before writing code.
5. While building: tests first for anything that moves money or trust; never invent content; record any new decision in `docs/decisions.md`.
6. Before each pull request, run the `iiic-reviewer` subagent on the diff and fix its Blocker and Fix findings.
