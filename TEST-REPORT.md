# MACE Web Interface — Test Report (Microchip Materials Workflows)

**Date:** 2025-02-14  
**Scope:** Verify that the workflows described for microchip-related materials discovery are possible via the web interface.

## Test Setup

- **Server:** Next.js dev server (`npm run dev`) at `http://localhost:3000`
- **Backend:** Local mode (Python `mace-api/calculate_local.py` with `mace-torch` + ASE)
- **Test structure:** 2-atom Si diamond unit cell (extended XYZ with lattice), matching ml-peg catalog

## API Tests (POST /api/calculate)

### 1. Single-point energy

- **Params:** `calculationType: "single-point"`, `modelType: "MACE-MP-0"`, `modelSize: "small"`
- **Result:** `status: "success"`, `energy: -4.758 eV`, forces array returned, ~4.7 s
- **Verdict:** Works — suitable for quick stability checks and energy comparison of bulk/interfaces/defects

### 2. Geometry optimization

- **Params:** `calculationType: "geometry-opt"`, `forceThreshold: 0.05`, `maxOptSteps: 50`
- **Result:** `status: "success"`, energy lowered to -4.761 eV, forces ~0.002 eV/A (converged in 2 steps), relaxed positions returned, ~3.2 s
- **Verdict:** Works — suitable for relaxing bulk crystals, interfaces, and defect supercells

### 3. Molecular dynamics (NVT)

- **Params:** `calculationType: "molecular-dynamics"`, `mdEnsemble: "NVT"`, `temperature: 300`, `mdSteps: 20`
- **Result:** `status: "success"`, `trajectory` with `energies[]`, `positions[][][]`, `step[]` (21 frames), ~3.5 s
- **Verdict:** Works — trajectory data supports the MD animation and energy chart in the UI; suitable for short thermal stability checks

## Conclusion

The web interface can be used for the microchip-related materials workflows:

| Workflow                     | Backend support | UI support                      |
|-----------------------------|-----------------|---------------------------------|
| Bulk crystal single-point   | Yes             | Energy, forces, 3D viewer       |
| Geometry optimization       | Yes             | Final structure, 3D viewer      |
| Short MD (thermal stability)| Yes             | Trajectory + animation/chart    |
| Export structure (.xyz/.cif)| No              | Not implemented                 |

**Recommendation:** Add export of result structure (and MD trajectory) as .xyz/.cif so relaxed structures and trajectories can be used in VESTA, OVITO, or other codes.
