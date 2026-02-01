# CS2535 Water Results Report

## Adding Your Report

1. **HTML Report**: Place your `water_results_report.html` file here
2. **For the website**: Copy it to `public/water_results_report.html`:
   ```bash
   cp water_results_report.html ../../public/water_results_report.html
   ```

3. **Structured Data**: Update `data/water_report.ts` with your actual lab results:
   - Edit the `waterReportData` object
   - Add/remove parameters in the `parameters` array
   - Each parameter: `{ parameter, value, unit, status, standard? }`
