# CS2535 Water Analysis System

Matrix-themed water quality report presentation for CS2535 Environmental Science. Built with Next.js, shadcn/ui, and Tailwind CSS.

## Features

- **Futuristic Matrix Design**: Green & black theme with scan-line effects and glowing typography
- **Introduction Page**: Project overview and navigation to report
- **Water Results Report**: Structured data view + full HTML report (iframe)
- **Vercel Ready**: Deploy with one click

## Adding Your Report

1. **HTML Report**: Copy your `water_results_report.html` to `public/water_results_report.html`
2. **Structured Data**: Edit `data/water_report.ts` with your lab parameters

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
