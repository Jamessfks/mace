import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const REPORT_IMAGES = [
  { src: "/report/curve_loss.png", alt: "Validation loss vs epoch" },
  { src: "/report/curve_energy_forces.png", alt: "MAE energy and forces vs epoch" },
  { src: "/report/curve_train_loss.png", alt: "Training loss vs epoch" },
] as const;

export function ReportSection() {
  return (
    <section id="report" className="relative py-20 px-4">
      <div className="max-w-4xl mx-auto space-y-12">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-primary font-mono glow-text">
            MACE Liquid Water — Results
          </h2>
          <p className="text-muted-foreground">
            User-friendly summary of the MACE training run on the liquid water dataset.
          </p>
        </div>

        {/* What the output means */}
        <Card className="bg-card border-primary/20 glow-border">
          <CardHeader>
            <CardTitle className="text-primary font-mono">What the output means</CardTitle>
            <CardDescription>Interpretation guide</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground text-sm leading-relaxed">
            <ul className="space-y-3 list-disc list-inside">
              <li>
                <strong className="text-primary">Training</strong>: MACE was trained to predict{" "}
                <em>energy</em> and <em>forces</em> of bulk liquid water from atomic positions (H
                and O). The reference data are DFT energies and forces.
              </li>
              <li>
                <strong className="text-primary">Validation metrics</strong>: After each epoch,
                the model is evaluated on a held-out validation set:
                <ul className="mt-2 ml-4 space-y-1 list-[circle]">
                  <li>
                    <strong>Loss</strong>: Combined error the optimizer minimizes. Lower is better.
                  </li>
                  <li>
                    <strong>MAE energy per atom (meV)</strong>: Mean absolute error in predicted
                    energy per atom. Lower is better.
                  </li>
                  <li>
                    <strong>MAE forces (meV/Å)</strong>: Mean absolute error in predicted forces.
                    Important for molecular dynamics. Lower is better.
                  </li>
                </ul>
              </li>
              <li>
                <strong className="text-primary">Findings</strong>: Forces typically improve
                quickly; energy per atom can be noisier early in training. Longer training improves
                both.
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Validation metrics */}
        <Card className="bg-card border-primary/20 glow-border">
          <CardHeader>
            <CardTitle className="text-primary font-mono">
              Validation metrics (this run)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <span className="inline-block px-4 py-2 rounded-lg bg-primary/10 text-primary border border-primary/30 font-mono text-sm">
              <strong>Initial</strong> — MAE E/atom: 2.62 meV, MAE F: 28.02 meV/Å
            </span>
            <span className="inline-block px-4 py-2 rounded-lg bg-primary/10 text-primary border border-primary/30 font-mono text-sm">
              <strong>After epoch 0</strong> — MAE E/atom: 32.84 meV, MAE F: 7.75 meV/Å
            </span>
          </CardContent>
        </Card>

        {/* Training curves */}
        <Card className="bg-card border-primary/20 glow-border">
          <CardHeader>
            <CardTitle className="text-primary font-mono">Training curves</CardTitle>
            <CardDescription>Validation and training metrics vs epoch</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {REPORT_IMAGES.map((img) => (
              <figure key={img.src} className="space-y-2">
                <div className="relative w-full aspect-video max-h-[400px] rounded-lg overflow-hidden border border-primary/20 bg-black/50">
                  <Image
                    src={img.src}
                    alt={img.alt}
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
                <figcaption className="text-muted-foreground text-sm">{img.alt}</figcaption>
              </figure>
            ))}
          </CardContent>
        </Card>

        {/* 3D static */}
        <Card className="bg-card border-primary/20 glow-border">
          <CardHeader>
            <CardTitle className="text-primary font-mono">3D atomic structure (static)</CardTitle>
            <CardDescription>
              One snapshot of liquid water from the training set. Red = oxygen, blue = hydrogen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative w-full aspect-video max-h-[500px] rounded-lg overflow-hidden border border-primary/20 bg-black/50">
              <Image
                src="/report/water_3d_static.png"
                alt="3D water structure"
                fill
                className="object-contain"
                unoptimized
              />
            </div>
          </CardContent>
        </Card>

        {/* 3D interactive */}
        <Card className="bg-card border-primary/20 glow-border">
          <CardHeader>
            <CardTitle className="text-primary font-mono">
              3D atomic structure (interactive)
            </CardTitle>
            <CardDescription>
              Rotate and zoom in your browser. Red = oxygen (O), light blue = hydrogen (H).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg overflow-hidden border border-primary/20 bg-black/50">
              <iframe
                src="/report/water_3d_interactive.html"
                title="3D water interactive"
                className="w-full h-[600px] min-h-[400px]"
              />
            </div>
          </CardContent>
        </Card>

        {/* How to read 3D */}
        <Card className="bg-card border-primary/20 glow-border">
          <CardHeader>
            <CardTitle className="text-primary font-mono">How to read the 3D view</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-muted-foreground text-sm list-disc list-inside">
              <li>Each sphere is an <strong className="text-primary">atom</strong> (position in space in Ångströms).</li>
              <li><strong className="text-primary">Oxygen (O)</strong> is shown in red; <strong className="text-primary">hydrogen (H)</strong> in light blue.</li>
              <li>Dotted lines indicate approximate O–H bonds (pairs within ~1.2 Å).</li>
              <li>This is one configuration (snapshot) of 64 water molecules in a periodic box from the dataset.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
