import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function IntroSection() {
  return (
    <section className="relative min-h-[85vh] flex flex-col items-center justify-center px-4 py-20 overflow-hidden">
      {/* Ambient grid background */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `
            linear-gradient(var(--matrix-green) 1px, transparent 1px),
            linear-gradient(90deg, var(--matrix-green) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />
      {/* Gradient vignette */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto text-center space-y-8">
        <p className="text-muted-foreground text-sm font-mono tracking-[0.3em] uppercase animate-matrix-pulse">
          CS2535 · MACE Molecular Dynamics
        </p>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight glow-text">
          <span className="text-primary">Liquid Water</span>
          <br />
          <span className="text-foreground">Results &amp; Visualizations</span>
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
          Machine-learning potential (MACE) trained on DFT reference data to predict
          energy and forces in bulk liquid water. Explore validation metrics, training
          curves, and 3D atomic structures below.
        </p>

        <Card className="bg-card/80 border-primary/30 glow-border backdrop-blur-sm text-left max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-primary font-mono text-lg">Project overview</CardTitle>
            <CardDescription className="text-muted-foreground">
              What this report contains
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-primary">Training</strong>: MACE was trained to predict
              energy and forces of bulk liquid water from atomic positions (H and O). Reference
              data are DFT energies and forces from BingqingCheng/ab-initio-thermodynamics-of-water.
            </p>
            <p>
              <strong className="text-primary">Validation metrics</strong>: Loss, MAE energy per
              atom (meV), and MAE forces (meV/Å) on a held-out validation set.
            </p>
            <p>
              <strong className="text-primary">Visualizations</strong>: Training curves and 3D
              atomic structure (static image + interactive viewer).
            </p>
          </CardContent>
        </Card>

        <a href="#report">
          <Button
            variant="outline"
            size="lg"
            className="border-primary/50 text-primary hover:bg-primary/10 hover:text-primary glow-border font-mono"
          >
            View full report
            <span className="ml-2 animate-cursor-blink">▌</span>
          </Button>
        </a>
      </div>
    </section>
  );
}
