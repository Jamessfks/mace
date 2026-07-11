/**
 * lib/history.ts — account-free record of recent calculations.
 *
 * A lightweight, browser-local (localStorage) history so returning users can
 * see what they ran without any login or server-side storage. Stores only a
 * compact summary of each run — never the uploaded structure itself.
 */

import type { CalculationParams } from "@/types/mace";

export interface HistoryEntry {
  id: string;
  timestamp: number; // epoch ms
  filename?: string;
  modelType: CalculationParams["modelType"];
  modelSize: CalculationParams["modelSize"];
  calculationType: CalculationParams["calculationType"];
  energy?: number; // total potential energy, eV
  atoms?: number;
  shareUrl?: string;
}

const KEY = "simpleatom.history.v1";
const MAX_ENTRIES = 20;

function read(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: HistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // storage full or unavailable — history is best-effort
  }
}

export function getHistory(): HistoryEntry[] {
  return read();
}

export function addHistory(
  entry: Omit<HistoryEntry, "id" | "timestamp">,
): HistoryEntry[] {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const full: HistoryEntry = { ...entry, id, timestamp: Date.now() };
  const next = [full, ...read()].slice(0, MAX_ENTRIES);
  write(next);
  return next;
}

export function updateHistoryShareUrl(
  id: string,
  shareUrl: string,
): HistoryEntry[] {
  const next = read().map((e) => (e.id === id ? { ...e, shareUrl } : e));
  write(next);
  return next;
}

export function clearHistory(): HistoryEntry[] {
  write([]);
  return [];
}
