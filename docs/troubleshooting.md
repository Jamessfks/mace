# Troubleshooting

| Problem | Solution |
|---------|----------|
| First calculation slow (~30s) | Normal — model downloads on first use, cached afterward |
| `mace-torch` install fails | Install PyTorch first: `pip install torch`. Requires Python 3.10+ |
| CUDA out of memory | Switch to CPU in the parameter panel, or use a smaller model |
| `torch.load` / `weights_only` error | PyTorch 2.6+ issue — already patched in `calculate_local.py`. Run `pip install --upgrade mace-torch` |
| MACE-OFF element error | MACE-OFF only supports 10 organic elements (H,C,N,O,F,P,S,Cl,Br,I). Use MACE-MP-0 for metals/inorganics |
| Shared link shows "not found" | The result ID may be invalid. Shared results are permanent once created |
| Validation suite fails | Run `pip install mace-torch ase` to ensure dependencies are installed |
| `MACE_API_URL` not working | Ensure it starts with `http://` or `https://`. Check the remote server is running |
