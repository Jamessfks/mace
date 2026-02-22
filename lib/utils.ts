import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * RMS force = sqrt(Σ|F_i|² / N_atoms) — standard MACE/ASE convention (eV/Å per atom).
 * Matches MACE-OFF, MACE-MP, and Materials Project reporting.
 */
export function computeRmsForce(forces: number[][] | undefined): number | null {
  if (!forces || forces.length === 0) return null
  const sumSq = forces.reduce(
    (s, f) => s + f[0] * f[0] + f[1] * f[1] + f[2] * f[2],
    0
  )
  return Math.sqrt(sumSq / forces.length)
}
