
# Base Chain Airdrop Farmer

A small toolkit for performing repeated USDC ↔ ETH swaps on the Base network. It contains two ways to run swaps:

- A frontend React app that runs in the browser and uses MetaMask for signing.
- A Node.js batch sender script that signs transactions with a private key and submits them via RPC.

This README explains how to run both tools, configuration options, and security notes.

---

## Prerequisites

- Node.js (16+) and npm
- A browser with MetaMask for the frontend mode
- An RPC endpoint (public RPC or your own node) for the batch script

---

## Install

Install dependencies once in the project root:

```bash
npm install
```

---

## Frontend (browser + MetaMask)

Run the dev server and open the app in your browser:

```bash
npm run dev
# then open the URL that Vite prints (usually http://localhost:5173)
```

Usage:

- Click the UI button to connect MetaMask.
- Configure `Amount` (USDC) and `Total Count` in the app UI.
- Click `Start Task` — each swap will prompt MetaMask to request a signature.

Notes:

- The frontend includes optimizations to avoid freezing the browser (throttled UI updates, limited DOM log entries, and concurrency limits).
- MetaMask requires manual confirmation for each transaction; the browser cannot auto-sign transactions.

---

## Node batch sender (automated signing)

The batch sender is `scripts/batch_send.js`. It signs transactions using a private key and is intended for use in a controlled, secure environment.

Important security note
- Never commit a private key to source control. Keep `.env` local and secure.
- Prefer running this script on an isolated machine or VM.

Create a `.env` file in the project root (example):

```ini
# SECURITY: keep this file secret and do not commit it
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
RPC_URL=https://mainnet.base.org
TOTAL_SWAPS=10
AMOUNT=0.01
DELAY_MS=15000

# Gas tuning (optional)
SLOW_GAS=true
PRIORITY_GWEI=0.1
MAXFEE_ADD_GWEI=1
GAS_MODE=slow
```

Run the script:

```bash
npm run batch:send
```

Behavior and options
- The script will ensure the router has sufficient USDC allowance (approving if needed).
- It will call `estimateGas` for each `execute` call and add a small buffer to `gasLimit`.
- When `SLOW_GAS=true` (or `GAS_MODE=slow`), the script computes `maxPriorityFeePerGas` and `maxFeePerGas` using the latest block base fee plus the configured `PRIORITY_GWEI` and `MAXFEE_ADD_GWEI` values to keep fees low.

Recommendations
- Test with `TOTAL_SWAPS=1` and a tiny `AMOUNT` before large runs.
- Use a separate test account with limited funds for trial runs.
- Lowering `PRIORITY_GWEI` / `MAXFEE_ADD_GWEI` reduces cost but may cause transactions to stay pending or not be mined.

---

## Troubleshooting

- If the frontend becomes unresponsive, reload the page and ensure MetaMask is connected.
- If transactions are not confirmed when using slow gas, increase `PRIORITY_GWEI` or `MAXFEE_ADD_GWEI` and retry.
- For the batch sender, monitor transaction hashes printed to the console and check your RPC node's logs if available.

---

## Important files

- `App.tsx` — Frontend React UI (MetaMask-driven)
- `services/ethereumService.ts` — Provider/signer and concurrency helpers used by the frontend
- `scripts/batch_send.js` — Node batch sender (private-key signing)
- `constants.ts`, `types.ts` — project constants and TypeScript types

---

If you want, I can add the following optional improvements:

- prompt-for-private-key interactive mode (avoid storing key in `.env`),
- automatic fee-bump-and-retry for stuck transactions.

Please tell me which option you prefer or if you want any sections expanded.

---

## CI / Auto-deploy to Vercel (GitHub)

A simple GitHub Action is included at `.github/workflows/vercel-deploy.yml` that will:

- run on pushes to `main` / `master`,
- install dependencies and build (`npm run build`),
- run the Vercel CLI to deploy the generated `dist` to your Vercel project.

Before the Action will work, set these repository secrets in GitHub (Settings → Secrets):

- `VERCEL_TOKEN` (required) — a Vercel personal token. Create one at https://vercel.com/account/tokens.
- `VERCEL_ORG_ID` (optional) — your Vercel organization ID.
- `VERCEL_PROJECT_ID` (optional) — your Vercel project ID.

Alternatively, you can rely on Vercel's native Git integration (recommended): import the repo into Vercel and let Vercel handle builds and deploys.

### .env.production example

An example is provided: `.env.production.example`. Do NOT include secrets such as private keys in Vite envs — these are exposed to the browser. Configure Vercel Project Environment Variables (Vite requires `VITE_` prefix for variables exposed to the client).


---

## Deploying to Vercel

Quick steps to deploy the frontend to Vercel:

1. Push this repository to a Git provider (GitHub, GitLab, or Bitbucket) and connect it to Vercel.
2. On Vercel, create a new Project and import the repo.
3. Set the Build Command to `npm run build` and the Output Directory to `dist` (the `vercel.json` included here already sets this).
4. Add environment variables in the Vercel Project Settings (Environment Variables):
	- `VITE_RPC_URL` — your RPC endpoint for the frontend (optional, used if not provided elsewhere).
	- Any other `VITE_` prefixed variables you need.
5. Deploy. Vercel will run `npm install` and `npm run build`, then serve the generated static site.

Notes:
- Use `VITE_` prefixed env vars to expose values to the browser (Vite requirement).
- Keep secrets off public projects. Do not store private keys as VITE variables (they are exposed client-side).

If you want, I can add a Vercel-specific environment example or create a GitHub Action to auto-deploy on push.


