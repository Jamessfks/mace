"use client";

import { useState } from "react";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import { FileText } from "lucide-react";
import type { CalculationResult } from "@/types/mace";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  title: {
    fontSize: 18,
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: "#00ff41",
    paddingBottom: 8,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    marginBottom: 8,
    color: "#00ff41",
  },
  row: {
    flexDirection: "row",
    marginBottom: 4,
  },
  label: {
    width: 120,
    color: "#666",
  },
  value: {
    flex: 1,
  },
  table: {
    marginTop: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 4,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderBottomColor: "#00ff41",
    paddingBottom: 6,
    marginBottom: 4,
    fontWeight: "bold",
  },
  tableCol1: { width: "10%", textAlign: "left" },
  tableCol2: { width: "15%", textAlign: "left" },
  tableCol3: { width: "20%", textAlign: "right" },
  tableCol4: { width: "20%", textAlign: "right" },
  tableCol5: { width: "20%", textAlign: "right" },
  tableCol6: { width: "15%", textAlign: "right" },
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

function MACEReportPDF({ result }: { result: CalculationResult }) {
  const forceMag = (f: number[]) =>
    Math.sqrt(f[0] ** 2 + f[1] ** 2 + f[2] ** 2).toFixed(4);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>MACE Calculation Report</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Status:</Text>
            <Text style={styles.value}>{result.status}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Total Energy:</Text>
            <Text style={styles.value}>{result.energy?.toFixed(6)} eV</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Energy per atom:</Text>
            <Text style={styles.value}>
              {result.symbols && result.energy
                ? (result.energy / result.symbols.length).toFixed(4)
                : "N/A"}{" "}
              eV
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Number of atoms:</Text>
            <Text style={styles.value}>{result.symbols?.length || 0}</Text>
          </View>
          {result.properties?.volume && (
            <View style={styles.row}>
              <Text style={styles.label}>Volume:</Text>
              <Text style={styles.value}>{result.properties.volume} Å³</Text>
            </View>
          )}
          {result.message && (
            <View style={styles.row}>
              <Text style={styles.label}>Note:</Text>
              <Text style={styles.value}>{result.message}</Text>
            </View>
          )}
        </View>

        {result.forces && result.symbols && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Atomic Forces (eV/Å)</Text>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={styles.tableCol1}>#</Text>
                <Text style={styles.tableCol2}>Element</Text>
                <Text style={styles.tableCol3}>Fx</Text>
                <Text style={styles.tableCol4}>Fy</Text>
                <Text style={styles.tableCol5}>Fz</Text>
                <Text style={styles.tableCol6}>|F|</Text>
              </View>
              {result.forces.slice(0, 50).map((force, i) => (
                <View key={i} style={styles.tableRow}>
                  <Text style={styles.tableCol1}>{i + 1}</Text>
                  <Text style={styles.tableCol2}>{result.symbols![i]}</Text>
                  <Text style={styles.tableCol3}>{force[0].toFixed(4)}</Text>
                  <Text style={styles.tableCol4}>{force[1].toFixed(4)}</Text>
                  <Text style={styles.tableCol5}>{force[2].toFixed(4)}</Text>
                  <Text style={styles.tableCol6}>{forceMag(force)}</Text>
                </View>
              ))}
              {result.forces.length > 50 && (
                <Text style={{ marginTop: 8, color: "#666" }}>
                  ... and {result.forces.length - 50} more atoms
                </Text>
              )}
            </View>
          </View>
        )}

        <Text style={styles.footer}>
          MACE Web Calculator • CS2535 Team 3 • Generated from mace-lake.vercel.app
        </Text>
      </Page>
    </Document>
  );
}

interface PDFReportButtonProps {
  result: CalculationResult;
}

export function PDFReportButton({ result }: PDFReportButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const blob = await pdf(<MACEReportPDF result={result} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mace-calculation-report.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="flex items-center gap-2 rounded border border-matrix-green/50 bg-matrix-green/10 px-3 py-1.5 font-mono text-xs text-matrix-green transition-colors hover:bg-matrix-green/20 disabled:opacity-50"
    >
      <FileText className="h-3 w-3" />
      {loading ? "Generating..." : "Download PDF Report"}
    </button>
  );
}
