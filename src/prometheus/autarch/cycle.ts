import type { PrometheusEventStore } from "../event-store.js";
import type { ExistingCapability } from "./registry.js";
import { replayPrometheusEvents } from "../state.js";
import {
  buildCapabilityGapDetectedEvents,
  detectCapabilityGapsFromFailedPaths,
} from "./gap-detection.js";
import { buildCapabilityGraph } from "./registry.js";

export type AutarchGapDetectionCycleResult = {
  suggestions: ReturnType<typeof detectCapabilityGapsFromFailedPaths>;
  appendedEventCount: number;
};

export async function runAutarchGapDetectionCycle(params: {
  eventStore: PrometheusEventStore;
  now: number;
  actorAgentId?: string;
  failedGoalIds?: readonly string[];
  existingCapabilities?: readonly ExistingCapability[];
  maxSuggestions?: number;
}): Promise<AutarchGapDetectionCycleResult> {
  const events = await params.eventStore.readAll();
  if (events.length === 0) {
    return {
      suggestions: [],
      appendedEventCount: 0,
    };
  }

  const state = replayPrometheusEvents(events);
  const graph = buildCapabilityGraph({
    state,
    existingCapabilities: params.existingCapabilities,
  });
  const suggestions = detectCapabilityGapsFromFailedPaths({
    state,
    failedGoalIds: params.failedGoalIds,
    coverageByGoal: graph.coverageByGoal,
    now: params.now,
    maxSuggestions: params.maxSuggestions,
  });
  if (suggestions.length === 0) {
    return {
      suggestions,
      appendedEventCount: 0,
    };
  }

  const gapEvents = buildCapabilityGapDetectedEvents({
    suggestions,
    occurredAt: params.now,
    actorAgentId: params.actorAgentId,
  });
  await params.eventStore.appendBatch(gapEvents);
  return {
    suggestions,
    appendedEventCount: gapEvents.length,
  };
}
