import fs from "node:fs/promises";
import path from "node:path";
import type { PrometheusEvent } from "./events.js";
import { assertPrometheusEvent } from "./events.js";

export type PrometheusEventStore = {
  append: (event: PrometheusEvent) => Promise<void>;
  appendBatch: (events: readonly PrometheusEvent[]) => Promise<void>;
  readAll: () => Promise<PrometheusEvent[]>;
};

function serializeEvent(event: PrometheusEvent): string {
  return `${JSON.stringify(event)}\n`;
}

async function ensureEventLogDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export function createFilePrometheusEventStore(filePath: string): PrometheusEventStore {
  const absolutePath = path.resolve(filePath);

  return {
    append: async (event) => {
      assertPrometheusEvent(event);
      await ensureEventLogDir(absolutePath);
      await fs.appendFile(absolutePath, serializeEvent(event), "utf8");
    },

    appendBatch: async (events) => {
      if (events.length === 0) {
        return;
      }
      for (const event of events) {
        assertPrometheusEvent(event);
      }
      await ensureEventLogDir(absolutePath);
      const payload = events.map(serializeEvent).join("");
      await fs.appendFile(absolutePath, payload, "utf8");
    },

    readAll: async () => {
      let raw = "";
      try {
        raw = await fs.readFile(absolutePath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return [];
        }
        throw error;
      }

      const events: PrometheusEvent[] = [];
      const lines = raw.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]?.trim();
        if (!line) {
          continue;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(line) as unknown;
        } catch (error) {
          throw new Error(
            `Failed to parse PROMETHEUS event log line ${index + 1}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            { cause: error },
          );
        }
        assertPrometheusEvent(parsed);
        events.push(parsed);
      }
      return events;
    },
  };
}
