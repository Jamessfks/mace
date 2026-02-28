import { saveResult, loadResult } from "./lib/share";
import type { CalculationResult, CalculationParams } from "./types/mace";

async function main() {
  const mockResult: CalculationResult = {
    status: "success",
    energy: -76.438,
    forces: [[0.001, -0.002, 0.003], [0.004, -0.001, 0.002], [-0.005, 0.003, -0.005]],
    symbols: ["O", "H", "H"],
    positions: [[0.0, 0.0, 0.117], [0.0, 0.757, -0.469], [0.0, -0.757, -0.469]],
  };

  const mockParams: Partial<CalculationParams> = {
    modelType: "MACE-MP-0",
    modelSize: "medium",
    calculationType: "single-point",
    precision: "float32",
    device: "cpu",
    dispersion: false,
  };

  console.log("1. Testing saveResult...");
  const { id, url } = await saveResult(mockResult, mockParams, "water.xyz");
  console.log(`   ✓ Saved with id=${id}, url=${url}`);

  console.log("2. Testing loadResult...");
  const loaded = await loadResult(id);
  if (!loaded) {
    console.error("   ✗ loadResult returned null — row was not persisted or RLS blocks reads");
    process.exit(1);
  }
  console.log(`   ✓ Loaded result: id=${loaded.id}, filename=${loaded.filename}, created_at=${loaded.created_at}`);

  if (loaded.result.energy !== mockResult.energy) {
    console.error(`   ✗ Energy mismatch: expected ${mockResult.energy}, got ${loaded.result.energy}`);
    process.exit(1);
  }
  if (loaded.result.symbols?.join(",") !== mockResult.symbols?.join(",")) {
    console.error("   ✗ Symbols mismatch");
    process.exit(1);
  }
  if (loaded.params.modelType !== mockParams.modelType) {
    console.error("   ✗ Params mismatch");
    process.exit(1);
  }
  console.log("   ✓ Data integrity verified (energy, symbols, params all match)");

  console.log("3. Testing loadResult with nonexistent ID...");
  const missing = await loadResult("zzzzzzzz");
  if (missing !== null) {
    console.error("   ✗ Expected null for nonexistent ID, got data");
    process.exit(1);
  }
  console.log("   ✓ Correctly returned null for nonexistent ID");

  console.log(`\n✅ All tests passed. Test result ID: ${id}`);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
