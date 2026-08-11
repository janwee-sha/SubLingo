<!--
Sync Impact Report
- Version change: unratified template -> 1.0.0
- Added principles:
  - I. Lightweight Dual-Track Delivery
  - II. SDD Artifacts Describe Current Intent
  - III. Minimal, Single-Purpose Context
  - IV. Explicit Parallel-Work Boundaries
  - V. Verification and Product Safety
- Added sections:
  - Delivery Track Selection
  - Development Workflow
- Removed sections: placeholder-only template sections
- Deferred TODOs: none
-->
# SubLingo Constitution

## Core Principles

### I. Lightweight Dual-Track Delivery

Every change MUST use the lightest process that safely preserves product intent.

- A new user-facing capability, cross-runtime change, security or privacy boundary,
  persistent-data change, or broad architectural change MUST use the full SDD track:
  specification, plan, actionable tasks, consistency review, implementation, and validation.
- A localized bug fix, documentation correction, dependency maintenance, test-only change,
  or behavior-preserving refactor SHOULD use the lightweight track: a concise problem statement,
  direct implementation, and proportionate verification.
- A lightweight change that grows beyond its original boundary MUST be promoted to the full SDD
  track before additional scope is implemented.

The purpose of process is to reduce uncertainty and risk, not to make every edit produce the same
set of documents.

### II. SDD Artifacts Describe Current Intent

SDD artifacts MUST describe the feature as it is currently intended, designed, and still awaiting
work. They MUST NOT serve as development diaries, changelogs, or append-only remediation logs.

- Superseded requirements, abandoned designs, obsolete tasks, and historical implementation paths
  MUST be removed instead of retained with annotations such as "legacy", "original", or
  "superseded".
- During active implementation, `tasks.md` MAY track completion with checkboxes. After convergence,
  completed implementation history MUST be removed or condensed; only genuine unfinished work,
  including outstanding validation, remains actionable.
- A substantial remediation discovered after a feature has converged MUST become a new bounded
  feature or lightweight change rather than another permanent phase appended to the old task list.
- Git history, issues, pull requests, release notes, and validation evidence are the authoritative
  historical record. SDD documents are not.

### III. Minimal, Single-Purpose Context

Each artifact MUST contain only the information required for its role and MUST reference, rather
than duplicate, details owned by another artifact.

- `spec.md` owns user outcomes, scope, requirements, and success criteria.
- `plan.md` owns the current architecture, technical constraints, and complexity justification.
- `research.md` owns only decisions that remain relevant to the current design.
- `data-model.md` and `contracts/` own current entities and interface boundaries.
- `quickstart.md` owns runnable validation scenarios.
- `tasks.md` owns current executable work and its dependencies.

Documents MUST be concise enough that an agent can load the relevant feature context without
crowding out source code, tests, or diagnostic output. If a feature cannot remain concise, it MUST
be divided into independently testable slices. Agents SHOULD receive only the artifact sections
and code needed for their assigned slice.

### IV. Explicit Parallel-Work Boundaries

Parallel execution MUST be based on actual dependency and file ownership, not merely on the
presence of a `[P]` marker.

- A task MAY be marked `[P]` only when it has no dependency on unfinished sibling work and does
  not modify the same files as another concurrent task.
- Concurrent agents working on independent features or slices MUST use isolated worktrees or an
  equivalent isolated workspace.
- Shared integration files and other hot spots MUST have one owner at a time or an explicit merge
  order.
- Every delegated task MUST state its scope, relevant contracts, allowed files, validation command,
  and completion condition.

### V. Verification and Product Safety

Changes MUST be verified in proportion to their risk and MUST preserve SubLingo's core safety
properties: original playback remains non-blocking, asynchronous results remain session-scoped,
credentials and subtitle content do not leak into diagnostics, and packaged behavior matches the
documented product boundary.

- Behavior changes MUST include automated regression coverage where the behavior is automatable.
- Cross-runtime, packaging, permission, and player-host behavior MUST retain explicit integration or
  manual acceptance work when automation cannot prove it.
- Unfinished validation MUST remain visible as actionable work and MUST NOT be marked complete from
  inference or superseded by unrelated passing tests.
- A change is complete only when its selected track's required checks pass and its current artifacts
  agree with the implementation.

## Delivery Track Selection

Use the full SDD track when any of the following is true:

- the change creates or materially alters a user story;
- it changes a public message, provider, storage, transport, packaging, privacy, or security
  contract;
- it spans multiple runtime owners or requires coordinated work across several subsystems;
- important scope or acceptance behavior is ambiguous;
- independent agents need a durable shared contract before implementation.

Use the lightweight track when the change is bounded, reversible, and adequately specified by a
short problem statement plus tests. The change owner MUST record the chosen track in the task,
issue, or working note and MUST reassess it if scope expands.

## Development Workflow

For full SDD work:

1. Define current user intent and measurable acceptance in `spec.md`.
2. Record only the chosen current design and necessary rationale in the design artifacts.
3. Generate small, dependency-ordered tasks with explicit file boundaries.
4. Analyze consistency before implementation and execute by bounded phase or slice.
5. Validate the implementation, reconcile artifacts to current truth, and remove completed or
   superseded task history before closing the feature.

For lightweight work:

1. State the problem, expected behavior, and affected boundary concisely.
2. Implement the smallest complete change.
3. Run focused regression tests and any broader checks justified by risk.
4. Promote the work to full SDD if new product scope or architectural uncertainty appears.

Reviews MUST reject process-only document growth, duplicated context, stale requirements, and task
lists that mix current work with historical narrative.

## Governance

This constitution governs project planning and implementation practices. Amendments require a
documented rationale, semantic version update, and review of affected active SDD artifacts.

- MAJOR changes remove or redefine a core principle incompatibly.
- MINOR changes add a principle or materially expand mandatory guidance.
- PATCH changes clarify wording without changing obligations.

Every full-SDD plan MUST perform a Constitution Check before design and again before implementation.
Every feature closeout MUST verify that its artifacts are concise, current, mutually consistent,
and free of development-log history. Exceptions MUST be explicit, time-bounded, and tied to an
owner and remediation task.

**Version**: 1.0.0 | **Ratified**: 2026-08-11 | **Last Amended**: 2026-08-11
