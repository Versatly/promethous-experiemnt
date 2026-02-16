---
summary: "PROMETHEUS rebuild architecture contract and migration invariants"
read_when:
  - Working on PROMETHEUS, HELIOS, AUTARCH, or MONOLITH modules
  - Defining compatibility boundaries during the rebuild
title: "PROMETHEUS Architecture Contract"
---

# PROMETHEUS architecture contract

This document defines the architecture contract for the PROMETHEUS rebuild program:

- **PROMETHEUS**: recursive meta-controller
- **HELIOS**: teleological coherence subsystem
- **AUTARCH**: endogenous capability synthesis subsystem
- **MONOLITH**: institution and capital substrate

## Primitive model

PROMETHEUS is built around these first-class primitives:

1. Goal primitive
2. Agent primitive
3. State space primitive
4. Feedback primitive
5. Capital primitive
6. Institution primitive
7. Synthesis operator
8. Recursion operator

All primitives must be:

- strictly typed
- event-addressable
- persisted in append-only history
- reconstructable by deterministic replay
- validated by invariant checks.

## Core invariants

The rebuild must preserve these non-negotiable invariants:

1. **Teleological anchor:** terminal objective state survives restarts and migrations.
2. **Trajectory integrity:** objective decomposition lineage cannot be broken silently.
3. **Synthesis traceability:** every synthesized capability must reference a gap.
4. **Institution authority coherence:** institution transitions must obey lifecycle rules.
5. **Capital consistency:** capital allocations always reference a valid institution.
6. **Recursion safety:** recursive strategy changes require policy checks and rollback path.
7. **Alignment guardrails:** divergence and incentive incoherence must be detectable.

## Compatibility contract during migration

PROMETHEUS is introduced with a strangler architecture. During migration:

- existing gateway protocol surfaces remain operational
- existing channel and extension integrations remain operational
- existing CLI and app flows remain operational
- adapter layers may route legacy operations into PROMETHEUS internals.

Cutover can happen only when parity criteria are met for:

- gateway method compatibility
- session continuity behavior
- channel send and receive reliability
- policy and approval enforcement semantics.

## Gateway compatibility adapters (read-only)

To keep existing gateway consumers stable while PROMETHEUS internals evolve, the gateway now exposes
read-only compatibility adapters under the `prometheus.*` namespace:

1. `prometheus.status`
2. `prometheus.control.catalog`
3. `prometheus.trajectory`
4. `prometheus.goals`
5. `prometheus.recursion`
6. `prometheus.autarch`
7. `prometheus.monolith`
8. `prometheus.control.preview`

These methods are intentionally scoped to telemetry and read models. They do not mutate state.

### Adapter payload contract (top-level fields)

- `prometheus.status`:
  - `ts`
  - `eventCount`
  - `summary`
  - `rootGoals`
  - `alignment`
- `prometheus.trajectory`:
  - `ts`
  - `goal`
  - `windowSize`
  - `sinceAt`
  - `snapshotCount`
  - `latest`
  - `scoreDeltaFromPrevious`
  - `divergence`
  - `snapshots`
- `prometheus.control.catalog`:
  - `ts`
  - `methods`
  - `controlPreview`
- `prometheus.goals`:
  - `ts`
  - `total`
  - `goals`
- `prometheus.recursion`:
  - `ts`
  - `windowSize`
  - `totals`
  - `cycles`
- `prometheus.autarch`:
  - `ts`
  - `summary`
  - `graph`
  - `goalsWithUnresolvedGaps`
  - `gaps`
  - `capabilities`
- `prometheus.monolith`:
  - `ts`
  - `summary`
  - `totalsByForm`
  - `institutions`
  - `allocationPreview`
- `prometheus.control.preview`:
  - `ts`
  - `action`
  - `mutatesState`
  - `preview`
  - supported `action` values:
    - `autarch.gap-detection`
      - required params: optional `maxItems`
    - `helios.trajectory-evaluation`
      - required params: `goalId`
    - `recursion.mutation-evaluation`
      - required params: `proposal`, `baseline`, `candidate`

Action-level contract metadata is centralized in gateway code (`PROMETHEUS_CONTROL_PREVIEW_ACTION_METADATA`)
and locked by unit/e2e tests to prevent control-surface drift during future write-method rollout.

Compatibility tests lock this response shape so method consumers can rely on stable key-level
contracts during migration.

### Adapter compatibility test matrix

Gateway parity is validated with dedicated compatibility tests:

- handler behavior tests
- authorization matrix tests (read/write scopes and role restrictions)
- response-shape contract tests
- error-shape parity tests
- e2e request/response tests across all `prometheus.*` methods
- cross-adapter summary consistency tests (`status` vs subsystem adapters)

When adding a new `prometheus.*` method, update this full matrix so compatibility regressions are
caught before cutover.

### Access policy

PROMETHEUS adapters are split between read telemetry and control preview surfaces:

- Read telemetry adapters (`status`, `trajectory`, `goals`, `recursion`, `autarch`, `monolith`):
- Read telemetry adapters (`status`, `control.catalog`, `trajectory`, `goals`, `recursion`, `autarch`, `monolith`):
  - allowed for `operator.read`, `operator.write`, and `operator.admin`
  - rejected when read scope is missing.
- Control preview adapter (`prometheus.control.preview`):
  - allowed for `operator.write` and `operator.admin`
  - rejected when write scope is missing.
- All `prometheus.*` adapters are rejected for `node` role.

This keeps parity with existing gateway authorization semantics for telemetry methods.

Method-level access and mutability metadata is centralized in gateway code
(`PROMETHEUS_GATEWAY_METHOD_METADATA`) so read/write scope partitioning and non-mutating guarantees
can be asserted in tests as new control methods are introduced.

## Scope boundaries

The initial PROMETHEUS implementation in this repository focuses on:

- primitive schemas
- event model
- deterministic state replay
- invariant enforcement
- file-backed append-only event log.

Institutional automation and real-world capital execution remain policy-gated by default.
