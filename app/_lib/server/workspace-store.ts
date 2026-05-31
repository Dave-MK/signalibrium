import { promises as fs } from "node:fs";
import path from "node:path";
import { defaultWorkspaceData } from "./workspace-seed";
import type { PersistedWorkspaceData } from "./workspace-types";

const dataDirectory = path.join(process.cwd(), "data");
const defaultStorePath = path.join(dataDirectory, "workspace.json");

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

export async function readWorkspaceData() {
  const storePath = await ensureStoreFile();
  const raw = await fs.readFile(storePath, "utf8");

  return JSON.parse(raw) as PersistedWorkspaceData;
}

export async function writeWorkspaceData(nextData: PersistedWorkspaceData) {
  const storePath = await ensureStoreFile();
  const stampedData: PersistedWorkspaceData = {
    ...nextData,
    updatedAt: new Date().toISOString(),
    workspace: {
      ...nextData.workspace,
      updatedAt: new Date().toISOString(),
    },
  };
  const tempPath = `${storePath}.tmp`;

  await fs.writeFile(tempPath, JSON.stringify(stampedData, null, 2), "utf8");
  await fs.rename(tempPath, storePath);

  return stampedData;
}

export function getWorkspaceStorePath() {
  return resolveStorePath();
}
