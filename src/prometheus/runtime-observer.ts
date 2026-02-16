import path from "node:path";
import type { AgentEventPayload } from "../infra/agent-events.js";
import type { PrometheusState } from "./state.js";
import { resolveStateDir } from "../config/paths.js";
import { onAgentEvent } from "../infra/agent-events.js";
import { createFilePrometheusEventStore, type PrometheusEventStore } from "./event-store.js";
import {
  createHeliosTrajectoryEvaluator,
  type HeliosTrajectoryEvaluator,
} from "./helios/evaluator.js";
import { createFileHeliosTrajectoryStore } from "./helios/trajectory-store.js";
import { replayPrometheusEvents } from "./state.js";

type ObserverLogger = {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};

const noop = () => {};
const NOOP_LOGGER: ObserverLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

export type PrometheusRuntimeObserverHandle = {
  enabled: boolean;
  stop: () => void;
  flush: () => Promise<void>;
};

export type PrometheusRuntimeObserverOptions = {
  enabled?: boolean;
  stateDir?: string;
  eventLogPath?: string;
  trajectoryLogPath?: string;
  rootGoalIds?: readonly string[];
  trajectoryWindowSize?: number;
  subscribe?: (listener: (evt: AgentEventPayload) => void) => () => void;
  eventStore?: PrometheusEventStore;
  evaluator?: HeliosTrajectoryEvaluator;
  now?: () => number;
  logger?: ObserverLogger;
};

function parseEnvInt(value: string | undefined, fallback: number): number {
  if (!value || !value.trim()) {
    return fallback;
  }
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseRootGoalList(value: string | undefined): string[] {
  if (!value || !value.trim()) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveRootGoalIds(state: PrometheusState, configured: readonly string[]): string[] {
  if (configured.length > 0) {
    return configured.filter((goalId) => Boolean(state.goals[goalId]));
  }
  return Object.values(state.goals)
    .filter((goal) => !goal.parentGoalId)
    .map((goal) => goal.id);
}

function isTerminalLifecycleEvent(evt: AgentEventPayload): boolean {
  if (evt.stream !== "lifecycle") {
    return false;
  }
  const phase = evt.data?.phase;
  return phase === "end" || phase === "error";
}

function defaultStateDir(options: PrometheusRuntimeObserverOptions): string {
  return options.stateDir ?? resolveStateDir();
}

function defaultEventLogPath(options: PrometheusRuntimeObserverOptions): string {
  return options.eventLogPath ?? path.join(defaultStateDir(options), "prometheus", "events.jsonl");
}

function defaultTrajectoryLogPath(options: PrometheusRuntimeObserverOptions): string {
  return (
    options.trajectoryLogPath ??
    path.join(defaultStateDir(options), "prometheus", "helios-trajectory.jsonl")
  );
}

function shouldEnableObserver(options: PrometheusRuntimeObserverOptions): boolean {
  if (options.enabled !== undefined) {
    return options.enabled;
  }
  return process.env.OPENCLAW_PROMETHEUS_OBSERVER === "1";
}

export function startPrometheusRuntimeObserver(
  options: PrometheusRuntimeObserverOptions = {},
): PrometheusRuntimeObserverHandle {
  const logger = options.logger ?? NOOP_LOGGER;
  if (!shouldEnableObserver(options)) {
    return {
      enabled: false,
      stop: noop,
      flush: async () => {},
    };
  }

  const configuredRootGoals =
    options.rootGoalIds?.filter(Boolean) ??
    parseRootGoalList(process.env.OPENCLAW_PROMETHEUS_ROOT_GOALS);
  const eventStore =
    options.eventStore ?? createFilePrometheusEventStore(defaultEventLogPath(options));
  const evaluator =
    options.evaluator ??
    createHeliosTrajectoryEvaluator({
      trajectoryStore: createFileHeliosTrajectoryStore(defaultTrajectoryLogPath(options)),
      trajectoryWindowSize:
        options.trajectoryWindowSize ??
        parseEnvInt(process.env.OPENCLAW_PROMETHEUS_WINDOW_SIZE, 24),
      now: options.now,
    });
  const subscribe = options.subscribe ?? onAgentEvent;
  let queue: Promise<void> = Promise.resolve();

  const evaluate = async (evt: AgentEventPayload) => {
    try {
      const events = await eventStore.readAll();
      if (events.length === 0) {
        logger.debug("PROMETHEUS observer skipped evaluation; event store is empty.", {
          runId: evt.runId,
        });
        return;
      }
      const state = replayPrometheusEvents(events);
      const rootGoalIds = resolveRootGoalIds(state, configuredRootGoals);
      if (rootGoalIds.length === 0) {
        logger.debug("PROMETHEUS observer skipped evaluation; no root goals available.", {
          runId: evt.runId,
        });
        return;
      }
      const results = await evaluator.evaluateGoals({
        state,
        rootGoalIds,
        at: options.now ? options.now() : evt.ts,
      });
      for (const result of results) {
        if (!result.escalation) {
          continue;
        }
        const meta = {
          runId: evt.runId,
          rootGoalId: result.rootGoalId,
          severity: result.escalation.signal.severity,
          level: result.escalation.level,
          latestScore: result.escalation.signal.latestScore,
          scoreDrop: result.escalation.signal.scoreDrop,
          recommendation: result.escalation.recommendedAction,
        };
        if (result.escalation.level === "critical") {
          logger.error("HELIOS drift escalation reached critical level.", meta);
          continue;
        }
        if (result.escalation.level === "intervention" || result.escalation.level === "warning") {
          logger.warn("HELIOS drift escalation triggered.", meta);
          continue;
        }
        logger.info("HELIOS divergence signal observed.", meta);
      }
    } catch (error) {
      logger.warn("PROMETHEUS observer evaluation failed.", {
        runId: evt.runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const unsubscribe = subscribe((evt) => {
    if (!isTerminalLifecycleEvent(evt)) {
      return;
    }
    queue = queue.then(() => evaluate(evt));
  });

  logger.info("PROMETHEUS observer started.", {
    eventLogPath: defaultEventLogPath(options),
    trajectoryLogPath: defaultTrajectoryLogPath(options),
    rootGoals: configuredRootGoals.length,
  });

  return {
    enabled: true,
    stop: () => unsubscribe(),
    flush: async () => queue,
  };
}
