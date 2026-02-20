from ase.io import read
from mace.calculators import MACECalculator

MODEL_PATH = r"runs/water_1k_small/checkpoints/best.pt"  # adjust to actual filename
atoms = read(r"data/valid.xyz", index=0)

atoms.calc = MACECalculator(model_path=MODEL_PATH, device="cpu")

print("Energy:", atoms.get_potential_energy())
print("Forces shape:", atoms.get_forces().shape)
