# MACE Force Fields — Deployment Guide

## Quick Deploy to Vercel

### 1. Push to GitHub

Commit and push all changes:

```bash
git add .
git commit -m "Add MACE web calculator and Tutorial 1 interface"
git push origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **"Add New Project"**
3. Import your repository: `Jamessfks/mace`
4. Vercel auto-detects Next.js — click **"Deploy"**
5. Wait ~2 minutes for build
6. Your site is live!

### 3. Binder Setup (for Tutorial 1 "Run" feature)

For `/tutorial1/run` to work:
- `notebooks/TUTORIAL_1_FIXES.ipynb` must be in your GitHub repo
- `requirements.txt` must be in the repo root
- Binder URL uses `HEAD` ref (always uses default branch)

First launch takes 1–2 minutes while Binder builds the environment.

## Environment Variables (if needed later)

For real MACE backend integration:

```bash
# Add these in Vercel dashboard → Settings → Environment Variables
PYTHON_BACKEND_URL=https://your-python-api.com
MACE_API_KEY=your-secret-key
```

## Routes Overview

| Route | Description | Type |
|-------|-------------|------|
| `/` | Matrix landing with neon scan animation | Static |
| `/report` | Liquid Water report (DFT, training curves, 3D) | Static |
| `/tutorial1` | MACE in Practice I (static HTML) | Static |
| `/tutorial1/run` | Run Tutorial 1 via Binder iframe | Static |
| `/calculate` | MACE Web Calculator interface | Static |
| `/api/calculate` | Calculation API (mock data for now) | Dynamic |

## Post-Deployment Checklist

- [ ] Test all routes on Vercel preview URL
- [ ] Verify `/tutorial1/run` Binder link works
- [ ] Check mobile responsiveness
- [ ] Test calculator with sample XYZ file
- [ ] Set up custom domain (optional)
- [ ] Add GitHub repo link to footer (optional)

## Known Limitations

### Current
- **Calculator API**: Returns mock data (no real MACE integration yet)
- **File parsing**: Files aren't validated/parsed before sending to API
- **3D Viewer**: Only works with mock data format
- **Binder**: First launch is slow (~2 min build time)

### Next Steps for Production
1. **Python Backend**
   - Use Vercel Python Runtime or separate Python API
   - Install `mace-torch`, `ase`
   - Parse uploaded structure files
   - Run real MACE calculations
   - Handle timeouts (10min Vercel limit)

2. **Enhanced Visualization**
   - Interactive energy/force plots (Chart.js)
   - MD trajectory animation
   - Export plots as PNG/SVG
   - Generate PDF reports

3. **UX Improvements**
   - Example structures gallery
   - Parameter validation tooltips
   - Calculation history
   - Save/bookmark results

## Architecture Notes

**Frontend:** Next.js App Router (static + dynamic routes)  
**API:** Node.js serverless functions (`app/api/**/route.ts`)  
**Future Backend:** Python for MACE (requires separate deployment or Vercel Python runtime)

For Python integration, consider:
- **Option A:** External Python API (separate server)
- **Option B:** Vercel Python runtime (experimental)
- **Option C:** Pre-compute results, store in database, frontend fetches

**Recommended:** Option A (external Python API) for reliability and MACE's heavy dependencies.
