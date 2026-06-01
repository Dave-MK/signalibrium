import { promises as fs } from "node:fs";
import path from "node:path";
import { defaultWorkspaceData } from "./workspace-seed";
import type { PersistedWorkspaceData } from "./workspace-types";

const dataDirectory = path.join(process.cwd(), "data");
const defaultStorePath = path.join(dataDirectory, "workspace.json");
let pendingWrite = Promise.resolve();

function resolveStorePath() {
  return process.env.SIGNALIBRIUM_STORE_PATH ?? defaultStorePath;
}

async function ensureStoreFile() {
  const storePath = resolveStorePath();

  try {
    await fs.access(storePath);
  } catch {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, JSON.stringify(defaultWorkspaceData, null, 2), "utf8");
  }

  return storePath;
}

function normalizeWorkspaceData(raw: unknown): PersistedWorkspaceData {
  const candidate = (raw ?? {}) as Partial<PersistedWorkspaceData>;

  return {
    schemaVersion: 3,
    updatedAt:
      typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : defaultWorkspaceData.updatedAt,
    workspace: {
      id: candidate.workspace?.id ?? defaultWorkspaceData.workspace.id,
      name: candidate.workspace?.name ?? defaultWorkspaceData.workspace.name,
      createdAt:
        candidate.workspace?.createdAt ?? defaultWorkspaceData.workspace.createdAt,
      updatedAt:
        candidate.workspace?.updatedAt ?? defaultWorkspaceData.workspace.updatedAt,
    },
    syncState: {
      sparklineCursor:
        typeof candidate.syncState?.sparklineCursor === "number"
          ? candidate.syncState.sparklineCursor
          : defaultWorkspaceData.syncState.sparklineCursor,
    },
    watchlists: Array.isArray(candidate.watchlists)
      ? candidate.watchlists
      : defaultWorkspaceData.watchlists,
    tradeTickets: Array.isArray(candidate.tradeTickets)
      ? candidate.tradeTickets
      : defaultWorkspaceData.tradeTickets,
    journalEntries: Array.isArray(candidate.journalEntries)
      ? candidate.journalEntries
      : defaultWorkspaceData.journalEntries,
    assets: Array.isArray(candidate.assets)
      ? candidate.assets
      : defaultWorkspaceData.assets,
    scannerResults: Array.isArray(candidate.scannerResults)
      ? candidate.scannerResults
      : defaultWorkspaceData.scannerResults,
    backtests: Array.isArray(candidate.backtests)
      ? candidate.backtests
      : defaultWorkspaceData.backtests,
    marketSnapshot:
      candidate.marketSnapshot ?? defaultWorkspaceData.marketSnapshot,
  };
}

function extractFirstCompleteJsonObject(raw: string) {
  let startIndex = -1;
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];

    if (startIndex === -1) {
      if (character === "{") {
        startIndex = index;
        depth = 1;
      }

      continue;
    }

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === "\"") {
        inString = false;
      }

      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return raw.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function queueWrite<T>(task: () => Promise<T>) {
  const result = pendingWrite.then(task, task);
  pendingWrite = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
}

export async function readWorkspaceData() {
  const storePath = await ensureStoreFile();
  const raw = await fs.readFile(storePath, "utf8");

  try {
    return normalizeWorkspaceData(JSON.parse(raw));
  } catch {
    const recoveredPayload = extractFirstCompleteJsonObject(raw);

    if (!recoveredPayload) {
      throw new Error("Workspace data is invalid and could not be repaired automatically.");
    }

    const recoveredData = normalizeWorkspaceData(JSON.parse(recoveredPayload));
    await writeWorkspaceData(recoveredData);

    return recoveredData;
  }
}

export async function writeWorkspaceData(nextData: PersistedWorkspaceData) {
  return queueWrite(async () => {
    const storePath = await ensureStoreFile();
    const now = new Date().toISOString();
    const stampedData: PersistedWorkspaceData = {
      ...nextData,
      updatedAt: now,
      workspace: {
        ...nextData.workspace,
        updatedAt: now,
      },
    };
    const tempPath = `${storePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;

    await fs.writeFile(tempPath, JSON.stringify(stampedData, null, 2), "utf8");
    await fs.rename(tempPath, storePath);

    return stampedData;
  });
}

export function getWorkspaceStorePath() {
  return resolveStorePath();
}
