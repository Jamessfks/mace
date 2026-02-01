/**
 * CS2535 Water Results Report Data
 * Replace with your actual water quality analysis data
 */

export interface WaterParameter {
  parameter: string;
  value: string | number;
  unit: string;
  status: "pass" | "fail" | "warning" | "pending";
  standard?: string;
}

export interface WaterReport {
  title: string;
  labId: string;
  date: string;
  sampleLocation: string;
  sampleType: string;
  parameters: WaterParameter[];
  summary: string;
  analyst?: string;
}

export const waterReportData: WaterReport = {
  title: "Water Quality Analysis Report",
  labId: "CS2535-WR-2025-001",
  date: "January 2025",
  sampleLocation: "Sample Site Alpha",
  sampleType: "Surface Water",
  analyst: "Environmental Science Lab",
  summary:
    "Comprehensive water quality analysis conducted per standard protocols. Results indicate overall compliance with EPA drinking water guidelines.",
  parameters: [
    {
      parameter: "pH",
      value: 7.2,
      unit: "pH units",
      status: "pass",
      standard: "6.5-8.5",
    },
    {
      parameter: "Turbidity",
      value: 0.45,
      unit: "NTU",
      status: "pass",
      standard: "< 1.0 NTU",
    },
    {
      parameter: "Dissolved Oxygen",
      value: 8.2,
      unit: "mg/L",
      status: "pass",
      standard: "> 5.0 mg/L",
    },
    {
      parameter: "Conductivity",
      value: 320,
      unit: "µS/cm",
      status: "pass",
      standard: "< 1500 µS/cm",
    },
    {
      parameter: "Total Coliform",
      value: 0,
      unit: "CFU/100mL",
      status: "pass",
      standard: "0 CFU",
    },
    {
      parameter: "Temperature",
      value: 18.5,
      unit: "°C",
      status: "pass",
      standard: "< 30°C",
    },
    {
      parameter: "Total Dissolved Solids",
      value: 185,
      unit: "mg/L",
      status: "pass",
      standard: "< 500 mg/L",
    },
    {
      parameter: "Nitrate",
      value: 2.1,
      unit: "mg/L",
      status: "pass",
      standard: "< 10 mg/L",
    },
  ],
};
