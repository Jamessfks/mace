"use client";

/**
 * BenchmarkExport — CSV, JSON, and PDF export for benchmark results.
 *
 * CSV: one row per structure, columns for each model's energy/force/time.
 * JSON: raw BenchmarkResult object.
 * PDF: @react-pdf/renderer document with leaderboard table, timing
 *   summary, and key findings (largest model disagreement).
 *
 * CSV values are escaped to handle commas/quotes in structure names.
 */

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import type { BenchmarkResult } from "@/types/mace";

const pdfStyles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  title: {
    fontSize: 18,
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: "#4A7BF7",
    paddingBottom: 8,
  },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, marginBottom: 8, color: "#4A7BF7" },
  row: { flexDirection: "row", marginBottom: 4 },
  label: { width: 160, color: "#666" },
  value: { flex: 1 },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 3,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderBottomColor: "#4A7BF7",
    paddingBottom: 5,
    marginBottom: 4,
    fontWeight: "bold",
  },
  col: { flex: 1, textAlign: "right", paddingHorizontal: 2 },
  colLeft: { flex: 1.5, textAlign: "left", paddingHorizontal: 2 },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#999",
    textAlign: "center",
  },
});

interface BenchmarkExportProps {
  result: BenchmarkResult;
}

function BenchmarkPDF({ result }: { result: BenchmarkResult }) {
  const modelLabels =
    result.results.length > 0
      ? result.results[0].models.map((m) => m.modelLabel)
      : [];

  let maxDisagreement = { structure: "", delta: 0 };
  for (const r of result.results) {
    const energies = r.models
      .filter((m) => m.status === "success" && m.energyPerAtom != null)
      .map((m) => m.energyPerAtom!);
    if (energies.length >= 2) {
      const d = (Math.max(...energies) - Math.min(...energies)) * 1000;
      if (d > maxDisagreement.delta) {
        maxDisagreement = { structure: r.structureName, delta: d };
      }
    }
  }

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <Text style={pdfStyles.title}>MACE Benchmark Report</Text>

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle}>Configuration</Text>
          <View style={pdfStyles.row}>
            <Text style={pdfStyles.label}>Models compared:</Text>
            <Text style={pdfStyles.value}>{modelLabels.join(", ")}</Text>
          </View>
          <View style={pdfStyles.row}>
            <Text style={pdfStyles.label}>Structures tested:</Text>
            <Text style={pdfStyles.value}>
              {result.summary.totalStructures} structures
            </Text>
          </View>
          <View style={pdfStyles.row}>
            <Text style={pdfStyles.label}>Total calculations:</Text>
            <Text style={pdfStyles.value}>
              {result.summary.totalCalculations} ({result.summary.successCount} success,{" "}
              {result.summary.errorCount} errors)
            </Text>
          </View>
          <View style={pdfStyles.row}>
            <Text style={pdfStyles.label}>Total time:</Text>
            <Text style={pdfStyles.value}>{result.summary.totalTime.toFixed(1)}s</Text>
          </View>
        </View>

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle}>Energy per Atom Leaderboard (eV)</Text>
          <View style={pdfStyles.tableHeader}>
            <Text style={pdfStyles.colLeft}>Structure</Text>
            <Text style={pdfStyles.col}>Ref.</Text>
            {modelLabels.map((l) => (
              <Text key={l} style={pdfStyles.col}>
                {l.replace("MACE-", "")}
              </Text>
            ))}
            <Text style={pdfStyles.col}>dE (meV)</Text>
          </View>
          {result.results.map((r) => {
            const energies = r.models
              .filter((m) => m.status === "success" && m.energyPerAtom != null)
              .map((m) => m.energyPerAtom!);
            const de =
              energies.length >= 2
                ? ((Math.max(...energies) - Math.min(...energies)) * 1000).toFixed(1)
                : "N/A";
            return (
              <View key={r.structureId} style={pdfStyles.tableRow}>
                <Text style={pdfStyles.colLeft}>{r.structureName}</Text>
                <Text style={pdfStyles.col}>
                  {r.reference?.cohesiveEnergy
                    ? r.reference.cohesiveEnergy.value.toFixed(2)
                    : "—"}
                </Text>
                {r.models.map((m, i) => (
                  <Text key={i} style={pdfStyles.col}>
                    {m.status === "success" && m.energyPerAtom != null
                      ? m.energyPerAtom.toFixed(4)
                      : "err"}
                  </Text>
                ))}
                <Text style={pdfStyles.col}>{de}</Text>
              </View>
            );
          })}
        </View>

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle}>Timing Summary</Text>
          {modelLabels.map((label, mi) => {
            const total = result.results.reduce(
              (s, r) => s + (r.models[mi]?.timeTaken ?? 0),
              0
            );
            return (
              <View key={label} style={pdfStyles.row}>
                <Text style={pdfStyles.label}>{label}:</Text>
                <Text style={pdfStyles.value}>{total.toFixed(1)}s total</Text>
              </View>
            );
          })}
        </View>

        {maxDisagreement.delta > 0 && (
          <View style={pdfStyles.section}>
            <Text style={pdfStyles.sectionTitle}>Key Findings</Text>
            <Text style={pdfStyles.value}>
              Largest model disagreement: {maxDisagreement.structure} (dE ={" "}
              {maxDisagreement.delta.toFixed(1)} meV/atom)
            </Text>
          </View>
        )}

        <View style={pdfStyles.section}>
          <Text style={{ fontSize: 7, color: "#999", lineHeight: 1.4 }}>
            Reference values are experimental cohesive energies (Kittel 8th ed., CRC Handbook).
            MACE is trained on PBE DFT, which differs from experiment by 0.1–0.5 eV/atom.
            Direct comparison of model total energy to experimental cohesive energy is not valid
            without accounting for isolated atom references and DFT functional biases.
            See Miret et al. (arXiv:2502.03660) for discussion of MLIP evaluation beyond
            energy/force regression.
          </Text>
        </View>

        <Text style={pdfStyles.footer}>
          MACE Benchmark Suite — Generated from mace-lake.vercel.app
        </Text>
      </Page>
    </Document>
  );
}

export function BenchmarkExport({ result }: BenchmarkExportProps) {
  const [pdfLoading, setPdfLoading] = useState(false);

  const modelLabels =
    result.results.length > 0
      ? result.results[0].models.map((m) => m.modelLabel)
      : [];

  const downloadCSV = () => {
    const headers = [
      "Structure",
      "Category",
      "Atoms",
      "Ref_Cohesive_Energy (eV/atom)",
      "Ref_Source",
      ...modelLabels.flatMap((l) => [
        `${l} Energy (eV/atom)`,
        `${l} RMS Force (eV/A)`,
        `${l} Time (s)`,
      ]),
      "DeltaE_max (meV)",
    ];

    const rows = result.results.map((r) => {
      const energies = r.models
        .filter((m) => m.status === "success" && m.energyPerAtom != null)
        .map((m) => m.energyPerAtom!);
      const de =
        energies.length >= 2
          ? (Math.max(...energies) - Math.min(...energies)) * 1000
          : 0;

      return [
        csvEscape(r.structureName),
        csvEscape(r.category),
        r.atomCount,
        r.reference?.cohesiveEnergy?.value?.toFixed(3) ?? "",
        csvEscape(r.reference?.cohesiveEnergy?.source ?? ""),
        ...r.models.flatMap((m) => [
          m.energyPerAtom?.toFixed(6) ?? "error",
          m.rmsForce?.toFixed(6) ?? "error",
          m.timeTaken?.toFixed(2) ?? "error",
        ]),
        de.toFixed(2),
      ].join(",");
    });

    const csv = headers.join(",") + "\n" + rows.join("\n");
    downloadBlob(csv, "mace-benchmark.csv", "text/csv");
  };

  const downloadJSON = () => {
    downloadBlob(
      JSON.stringify(result, null, 2),
      "mace-benchmark.json",
      "application/json"
    );
  };

  const downloadPDF = async () => {
    setPdfLoading(true);
    try {
      const blob = await pdf(<BenchmarkPDF result={result} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mace-benchmark-report.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={downloadPDF}
        disabled={pdfLoading}
        className="flex items-center gap-1.5 rounded border border-[var(--color-accent-primary)]/50 bg-[var(--color-accent-primary)]/10 px-3 py-1.5 font-mono text-xs text-[var(--color-accent-primary)] transition-colors hover:bg-[var(--color-accent-primary)]/15 disabled:opacity-50"
      >
        <FileText className="h-3 w-3" />
        {pdfLoading ? "Generating..." : "Export PDF"}
      </button>
      <button
        onClick={downloadCSV}
        className="flex items-center gap-1.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-3 py-1.5 font-mono text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent-primary)]/50 hover:text-[var(--color-accent-primary)]"
      >
        <Download className="h-3 w-3" /> Export CSV
      </button>
      <button
        onClick={downloadJSON}
        className="flex items-center gap-1.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-3 py-1.5 font-mono text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent-primary)]/50 hover:text-[var(--color-accent-primary)]"
      >
        <Download className="h-3 w-3" /> Export JSON
      </button>
    </div>
  );
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
