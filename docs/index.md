# MACE Force Fields — Web Interface

**Run DFT-accuracy atomistic simulations entirely in your browser. No installation. No command line. No barriers.**

[Live Demo: mace-lake.vercel.app](https://mace-lake.vercel.app){ .md-button .md-button--primary }

---

## What is this?

A browser-based interface for [MACE](https://github.com/ACEsuit/mace) (Multi-Atomic Cluster Expansion) machine learning interatomic potentials. Upload a crystal or molecular structure, pick a model, and get publication-quality energies, forces, and trajectories in seconds.

## Why it exists and the story behind it

I am a freshman college student majoring in computer science. I was lucky to be assigned a research project by Oak Ridge National Laboratory, focusing on the use of MACE.

MACE is a powerful tool for quantum chemistry, but I initially had no idea how to use it. The detailed documentation and Google Colab are not user-friendly, at least for me.

So I decided to act.

I am not an expert in quantum chemistry or machine-learning interatomic potentials, but I'm a front-end developer. I can visualize complex, abstract tools and simplify the command-line interface into a modern software tool accessible to researchers and even students in my research team.

[Rowan Scientific](https://www.rowansci.com/), a molecular design and simulation platform for scientists, truly inspires me. They share my vision of making complex scientific tools more accessible to researchers. I would like to include their quote:

> *"We're starting Rowan because we think that scientific software shouldn't be hard to use."*

It is inspiring when I realize they had the exact same vision as I did!

Especially with the age of AI, modern software using AI agents becomes increasingly easy to build, and the quality is amazing. Even someone without a PhD in quantum chemistry can build a research-grade web interface for others to use.

Machine learning interatomic potentials like MACE have reached DFT-level accuracy while running orders of magnitude faster. But using them still requires Python scripting, command-line fluency, and environment setup that shuts out many researchers — especially those with accessibility needs, those in under-resourced labs, or students encountering computational chemistry for the first time.

This project removes that barrier.

## Key capabilities

| Feature | Details |
|---|---|
| **Structure input** | Drag-and-drop `.xyz`, `.cif`, `.poscar`, `.pdb` or pick from a built-in catalog of 14 benchmark structures |
| **Foundation models** | MACE-MP-0 (89 elements, materials) and MACE-OFF (organic molecules) in small/medium/large |
| **Custom models** | Upload your own `.model` file and compare against foundation models |
| **Calculations** | Single-point energy & forces, geometry optimization (BFGS), molecular dynamics (NVE/NVT/NPT) |
| **Visualization** | Dual 3D viewers (3Dmol.js + WEAS), interactive Plotly charts, MD trajectory player |
| **Sharing** | Every result becomes a permanent shareable URL via MACE Link |
| **Benchmark** | Batch-evaluate multiple models across multiple structures with leaderboard and export |
| **Accessibility** | Keyboard navigation, ARIA labels, colorblind-safe palette (Paul Tol) |

## Quick links

- [Getting Started](getting-started.md) — install and run locally in 3 commands
- [Calculator Guide](guide/calculator.md) — walkthrough of a calculation
- [MACE Calculator Parameters](guide/mace-calculator-parameters.md) — complete parameter reference
- [Models](science/models.md) — which model to pick for your system
- [Validation](science/validation.md) — how results are verified
- [Architecture](dev/architecture.md) — system design and data flow
- [API Reference](dev/api.md) — calculation API details

---

Built by **Zicheng Zhao** · Northeastern University
