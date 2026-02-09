# MACE Force Fields — Team 3

**CS2535 ORNL #3.** Machine learning for understanding materials inside microchips. Matrix-themed web platform with MACE training reports and web calculator.

**Team:** Arya Baviskar, Isaac Sohn, Harshitha Somasundaram, Kartik Patri, Zicheng Zhao

## Features

- **Matrix-Themed Landing**: Neon scan animation, futuristic green/black design
- **Liquid Water Report**: DFT training results, 3D visualizations, interactive plots
- **MACE Web Calculator**: No-code interface for running MACE calculations
  - Upload structures (.xyz, .cif, .poscar, .pdb)
  - Configure model & parameters
  - View energy, forces, 3D structure
  - Download results as JSON
- **Vercel Ready**: Deploy with one click

## Project Structure

### Routes
- `/` — Matrix intro with neon scan, links to reports and calculator
- `/report` — Liquid Water results (training curves, validation metrics, 3D)
- `/calculate` — MACE Web Calculator (no-code interface)

### Key Files
- `app/page.tsx` — Main landing page
- `components/intro-section.tsx` — Matrix hero section
- `app/calculate/page.tsx` — Calculator interface
- `requirements.txt` — Python deps (optional)
- See `CALCULATOR_README.md` for calculator architecture

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


## Using RailWay

MACE is a Python program that needs PyTorch, etc. Browsers only run JavaScript. So the browser cannot run MACE by itself.Therefore, l need a backend server for the calculation. That server is a separate machine (or service) that runs your MACE API.

Railway (or any hosted backend) means:
The user does nothing: open the Vercel site, upload a file, click Run.
You (or your team) handle one deployment; everyone shares it.