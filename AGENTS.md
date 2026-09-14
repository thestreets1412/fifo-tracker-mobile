# Working agreements

- Communicate in concise Thai. Write new technical documents, comments, and commit
  messages in English; preserve required UI/report languages.
- Work on `develop`. Keep edits, artifacts, temporary files, and tool caches inside
  `D:\Python\fifo-tracker-mobile`; use ignored `.local-tools/` for tooling outputs.
  Do not modify other projects or system settings.
- Do not commit, merge, push, publish, or change external services without explicit
  authorization for that action. Do not use subagents unless requested.

## Context and implementation

- Check Git status first; preserve unrelated changes. Read `CLAUDE.md` for project
  invariants and `docs/HANDOFF.md` for handoff context. Verify stale status against
  Git and code. Follow the approved spec and relevant plan; do not copy their content
  into new documents. Read the design spec before non-trivial changes, as required
  by `CLAUDE.md`.
- Expo HAS CHANGED: read https://docs.expo.dev/versions/v57.0.0/ before writing code.
  Consult relevant v57 API pages and installed interfaces when needed.
- Reuse context already read in this task unless it may be stale. Search narrowly,
  read relevant sections, batch independent inspections, and limit tool output.
- If requirements are clear, implement through completion without another planning
  or approval round. Investigate blocking technical uncertainty with a small,
  bounded experiment. Resolve reversible details independently; ask only about
  consequential ambiguity in scope, behavior, data safety, security, or cost.
- Keep changes within scope; reuse existing logic and components. Consult the
  project design skill for UI changes. Avoid unrelated cleanup and speculative
  abstractions. Add a plan only when requested or necessary; record new decisions
  and risks, linking existing requirements.

## Validation and delivery

- Test according to risk, especially financial correctness, data integrity, and
  failure recovery. Run focused checks while editing and required integration
  checks at completion. Honor explicit acceptance criteria; repeat checks only
  after relevant changes, failures, or unresolved concerns.
- Review the final diff. Distinguish automated verification from unverified device
  behavior; never claim checks that were not run.
- After implementation, update the existing handoff concisely and correct affected
  stale status. Avoid duplicate status documents. Finish with a short Thai summary
  of changes, verification, and remaining limitations.
