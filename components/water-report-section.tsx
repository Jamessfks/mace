"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { waterReportData } from "@/data/water_report";

const statusColors = {
  pass: "border-matrix-green/50 bg-matrix-green/10 text-matrix-green",
  fail: "border-red-500/50 bg-red-500/10 text-red-400",
  warning: "border-amber-500/50 bg-amber-500/10 text-amber-400",
  pending: "border-zinc-500/50 bg-zinc-500/10 text-zinc-400",
};

export function WaterReportSection() {
  return (
    <section
      id="report"
      className="relative min-h-screen px-6 py-24"
    >
      <div className="mx-auto max-w-5xl">
        {/* Section header */}
        <div className="mb-12 text-center">
          <h2 className="font-mono text-3xl font-bold text-white sm:text-4xl">
            <span className="text-matrix-green">[</span> WATER RESULTS REPORT{" "}
            <span className="text-matrix-green">]</span>
          </h2>
          <p className="mt-2 font-mono text-zinc-400">
            CS2535 Environmental Science • Lab Analysis
          </p>
        </div>

        {/* Report metadata card */}
        <Card className="mb-8 border-matrix-green/30 bg-black/80 backdrop-blur">
          <CardHeader className="border-b border-matrix-green/20">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle className="font-mono text-matrix-green">
                  {waterReportData.title}
                </CardTitle>
                <CardDescription className="font-mono text-zinc-400">
                  Lab ID: {waterReportData.labId}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Badge
                  variant="outline"
                  className="border-matrix-green/50 bg-matrix-green/10 font-mono text-matrix-green"
                >
                  {waterReportData.date}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-matrix-green/50 font-mono text-zinc-400"
                >
                  {waterReportData.sampleType}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="font-mono text-xs text-zinc-500">
                  SAMPLE LOCATION
                </span>
                <p className="font-mono text-zinc-300">
                  {waterReportData.sampleLocation}
                </p>
              </div>
              {waterReportData.analyst && (
                <div>
                  <span className="font-mono text-xs text-zinc-500">
                    ANALYST
                  </span>
                  <p className="font-mono text-zinc-300">
                    {waterReportData.analyst}
                  </p>
                </div>
              )}
            </div>
            <p className="mt-4 font-mono text-sm text-zinc-400">
              {waterReportData.summary}
            </p>
          </CardContent>
        </Card>

        {/* Report views - Tabs for structured data vs full HTML */}
        <Tabs defaultValue="parameters" className="w-full">
          <TabsList className="mb-4 grid w-full grid-cols-2 border border-matrix-green/30 bg-black/80 font-mono">
            <TabsTrigger
              value="parameters"
              className="data-[state=active]:bg-matrix-green/20 data-[state=active]:text-matrix-green"
            >
              PARAMETERS
            </TabsTrigger>
            <TabsTrigger
              value="full-report"
              className="data-[state=active]:bg-matrix-green/20 data-[state=active]:text-matrix-green"
            >
              FULL REPORT
            </TabsTrigger>
          </TabsList>
          <TabsContent value="parameters">
        <Card className="border-matrix-green/30 bg-black/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="font-mono text-white">
              ANALYZED PARAMETERS
            </CardTitle>
            <CardDescription className="font-mono text-zinc-400">
              Water quality metrics vs. regulatory standards
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {waterReportData.parameters.map((param, i) => (
                  <div
                    key={param.parameter}
                    className="group flex flex-wrap items-center justify-between gap-4 rounded-lg border border-matrix-green/10 bg-black/50 p-4 font-mono transition-all hover:border-matrix-green/30 hover:bg-matrix-green/5"
                    style={{
                      animationDelay: `${i * 50}ms`,
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-matrix-green/60 text-xs">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <p className="font-medium text-white">
                          {param.parameter}
                        </p>
                        {param.standard && (
                          <p className="text-xs text-zinc-500">
                            Standard: {param.standard}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-matrix-green text-lg font-bold">
                        {param.value} {param.unit}
                      </span>
                      <Badge
                        variant="outline"
                        className={statusColors[param.status]}
                      >
                        {param.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
          </TabsContent>
          <TabsContent value="full-report">
        <Card className="border-matrix-green/30 bg-black/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="font-mono text-white">
              FULL HTML REPORT
            </CardTitle>
            <CardDescription className="font-mono text-zinc-400">
              Replace public/water_results_report.html with your CS2535 report
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-matrix-green/20 overflow-hidden">
              <iframe
                src="/water_results_report.html"
                title="Water Results Report"
                className="h-[500px] w-full bg-black"
              />
            </div>
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>

        {/* Footer note */}
        <p className="mt-8 text-center font-mono text-xs text-zinc-500">
          Report generated for academic purposes • CS2535 Environmental Science
        </p>
      </div>
    </section>
  );
}
