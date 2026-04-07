# Benchmark Suite

The benchmark suite at [`/benchmark`](https://mace-lake.vercel.app/benchmark) lets you batch-evaluate 2-3 MACE models across multiple structures.

## How to use

1. **Select models** — choose 2-3 models to compare (e.g., MACE-MP-0 small vs. medium vs. large)
2. **Select structures** — pick from the ml-peg catalog or upload your own
3. **Run** — the suite runs all model-structure combinations
4. **Analyze** — browse the results tabs

## Results tabs

| Tab | Content |
|-----|---------|
| **Leaderboard** | Sortable table of energy/atom across all models and structures |
| **Force comparison** | RMS force bar chart with per-atom breakdown |
| **Timing** | Wall-clock time per calculation with speedup ratios |
| **Energy landscape** | Energy/atom scatter plot across structures |
| **Model agreement** | Pairwise heatmap showing how closely models agree |

## Export

All results can be exported as:

- **CSV** — tabular data for spreadsheets
- **JSON** — full structured results
- **PDF** — formatted report with charts
