# MACE Web Calculator

Production-ready web interface for MACE calculations without coding knowledge.

## Features Implemented

### Phase 1: Core Structure ✅ COMPLETE
- [x] Next.js project with TypeScript
- [x] Three-column responsive layout
- [x] Matrix-themed UI consistent with main site
- [x] File upload component with drag & drop

### Phase 2: Frontend Components ✅ COMPLETE
- [x] Parameter configuration panel
  - Model selection (size, type, precision, device)
  - Calculation type (single-point, geometry opt, MD, phonon)
  - Physical parameters (temperature, pressure, time step, dispersion)
  - Advanced options (collapsible with cutoff, max steps)
- [x] File upload section
  - Supports .xyz, .cif, .poscar, .pdb
  - Drag & drop interface
  - File list with remove functionality
  - Multi-file batch upload
- [x] Results display
  - Energy and forces property cards
  - Atomic forces table (sortable)
  - Download JSON option
  - 3D molecular viewer integration

### Phase 3: Backend Integration ✅
- [x] API route structure (`/api/calculate`)
- [x] Mock data fallback when MACE_API_URL not set
- [x] **Python MACE API** (`mace-api/`) — FastAPI with MACE-torch
  - ASE file parsing (XYZ, CIF, POSCAR, PDB)
  - Loads pre-trained MACE foundation models (MACE-MP, MACE-OFF)
  - Single-point energy/forces
  - EMT fallback when model not found
- [x] Next.js proxies to Python API when `MACE_API_URL` env var set
- [ ] **TODO:** Job queue for long-running (>10min) calculations

### Phase 4: Visualization ✅ / ⚠️ Advanced Pending
- [x] 3D molecular viewer (3Dmol.js)
  - Ball-and-stick representation
  - CPK element coloring
  - Force vectors overlay (green arrows)
  - Mouse controls (rotate, zoom)
- [x] **PDF Report** — @react-pdf/renderer
  - Summary (energy, forces, atom count, volume)
  - Atomic forces table (first 50 atoms)
  - "Download PDF Report" button in results
- [ ] **TODO:** Dynamic energy/force plots (Chart.js)
- [ ] **TODO:** MD trajectory animation
- [ ] **TODO:** Export plots as PNG/SVG

## Usage

### Accessing the Calculator

1. From home page: Click **"MACE Web Calculator →"** link
2. Direct URL: `/calculate`

### Running a Calculation

1. **Upload Structure**
   - Drag & drop or click to browse
   - Supports multiple files
   - Accepted formats: .xyz, .cif, .poscar, .contcar, .pdb

2. **Configure Parameters**
   - Select model (small/medium/large)
   - Choose calculation type
   - Adjust physical parameters
   - (Optional) Expand advanced options

3. **Run Calculation**
   - Click "RUN MACE CALCULATION"
   - View real-time status
   - Results appear automatically

4. **Download Results**
   - Click "Download JSON" for full data
   - (Coming soon) Export structure, plots, PDF report

## API Structure

### POST /api/calculate

**Request:** multipart/form-data
- `files`: structure files
- `params`: JSON string of CalculationParams

**Response:** CalculationResult JSON
```json
{
  "status": "success",
  "energy": -156.234567,
  "forces": [[0.0123, -0.0045, 0.0067], ...],
  "positions": [[0, 0, 0], ...],
  "symbols": ["O", "H", "H", "C"],
  "properties": { "volume": 125.6, "density": 0.98 }
}
```

## Next Steps

### Backend Integration
1. Create Python serverless function
2. Install MACE dependencies (`mace-torch`, `ase`)
3. Parse uploaded structure files
4. Run actual MACE calculations
5. Handle timeouts (10min limit on Vercel)

### 3D Visualization
1. Integrate Three.js or Plotly
2. Render atoms with CPK coloring
3. Show bonds and lattice
4. Add force vectors overlay
5. Animation for MD trajectories

### Enhanced Features
1. Example structures gallery
2. Parameter presets (quick start)
3. Comparison mode (multiple structures)
4. Export to PDF report
5. Save/bookmark results

## Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build
```

## Tech Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **UI Components:** shadcn/ui, lucide-react
- **Icons:** Lucide React
- **Backend:** Vercel Serverless Functions (Node.js API routes)
- **Future:** Python runtime for MACE integration

## File Structure

```
app/
  calculate/
    page.tsx          # Main calculator page
  api/
    calculate/
      route.ts        # API endpoint (mock for now)
components/
  calculate/
    file-upload-section.tsx
    parameter-panel.tsx
    results-display.tsx
types/
  mace.ts            # TypeScript definitions
```
