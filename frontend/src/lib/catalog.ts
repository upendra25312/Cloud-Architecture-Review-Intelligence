import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  CatalogSummary,
  ChecklistItem,
  ServiceIndex,
  ServicePayload,
  TechnologyIndex,
  TechnologyPayload
} from "@/types";

async function readJsonFile<T>(segments: string[]) {
  const filePath = path.join(process.cwd(), ...segments);
  const contents = await fs.readFile(filePath, "utf8");

  return JSON.parse(contents) as T;
}

export async function readSummary() {
  return readJsonFile<CatalogSummary>(["public", "data", "summary.json"]);
}

export async function readCatalogItems() {
  const payload = await readJsonFile<{ generatedAt: string; items: ChecklistItem[] }>([
    "public",
    "data",
    "catalog.json"
  ]);

  return payload.items;
}

export async function readTechnologyIndex() {
  return readJsonFile<TechnologyIndex>(["public", "data", "technology-index.json"]);
}

export async function readTechnologyPayload(slug: string) {
  try {
    return await readJsonFile<TechnologyPayload>([
      "public",
      "data",
      "technologies",
      `${slug}.json`
    ]);
  } catch {
    return null;
  }
}

export async function readServiceIndex() {
  return readJsonFile<ServiceIndex>(["public", "data", "service-index.json"]);
}

export async function readServicePayload(slug: string) {
  try {
    return await readJsonFile<ServicePayload>(["public", "data", "services", `${slug}.json`]);
  } catch {
    return null;
  }
}
