export function Footer() {
  return (
    <footer className="border-t border-primary/20 py-8 px-4">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-muted-foreground text-sm">
        <p className="font-mono">CS2535 · MACE Liquid Water</p>
        <p>
          Dataset:{" "}
          <a
            href="https://github.com/BingqingCheng/ab-initio-thermodynamics-of-water"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            BingqingCheng/ab-initio-thermodynamics-of-water
          </a>
        </p>
      </div>
    </footer>
  );
}
