# CLAUDE.md

Read [`AGENTS.md`](AGENTS.md) first. It is the canonical agent entry point for this repository.

Agent skills, global instructions, and the machine-readable repo context live in
[`skills/master_skill_compilation.json`](skills/master_skill_compilation.json).

This file exists only so that tools which look for `CLAUDE.md` instead of `AGENTS.md` are routed to
the same source of truth. Do not add rules here.
