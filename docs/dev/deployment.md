# Deployment

## Architecture

```
              Users
                |
                v
        +---------------+
        | Vercel CDN    |
        | (Frontend)    |
        | Next.js 16    |
        +-------+-------+
                |
    +-----------+-----------+
    |                       |
    v                       v
+------------------+  +------------------+
| Supabase         |  | Hugging Face     |
| (PostgreSQL)     |  | Spaces (Docker)  |
| shared_results   |  | FastAPI + MACE   |
| Public RLS       |  | Port 7860        |
+------------------+  +------------------+
```

## Frontend — Vercel

1. Push your repo to GitHub
2. Import the repo at [vercel.com](https://vercel.com)
3. Set environment variables:

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `MACE_API_URL` | No | Remote backend URL (omit for local mode) |

## Backend — Hugging Face Spaces

1. Create a new Space at [huggingface.co](https://huggingface.co) (SDK: Docker)
2. Push `mace-api/` contents to the Space repo
3. Copy the Space URL (e.g., `https://<user>-mace-api.hf.space`)
4. Set `MACE_API_URL` in Vercel to the Space URL

The Dockerfile in `mace-api/` is pre-configured for Spaces deployment on port 7860.

## Local development

No remote backend needed. When `MACE_API_URL` is not set, the Next.js API route spawns a local Python subprocess:

```bash
npm run dev    # Frontend on localhost:3000
# Calculations run via python3 mace-api/calculate_local.py
```

Requires `mace-torch` and `ase` installed in your Python environment.

## Backend standalone (FastAPI)

For development or custom deployment:

```bash
cd mace-api
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 7860
```
