This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

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

## Load testing

The load-test profile points every backend dependency (dpm-api, backoffice-api,
api-football) at local mock servers with load-test credentials, so the app can
be driven at high volume without touching production or real upstreams.

1. Create your load-test env from the template and fill in any placeholder secrets:

   ```bash
   cp .env.local.loadtest.example .env.local.loadtest
   ```

2. Run the load-test build:

   ```bash
   # production-like (recommended for realistic numbers)
   npm run build
   npm run start:loadtest

   # or a quick check against the dev server
   npm run dev:loadtest
   ```

These scripts run Next through `scripts/with-loadtest-env.mjs`, which loads
`.env.local.loadtest` into `process.env` before starting. Next.js checks
`process.env` **before** `.env.local`, so the load-test values override your
normal local config without modifying `.env.local`. (We can't use Node's
`--env-file` flag here — `next dev` forks workers and Node rejects that flag in
the propagated `NODE_OPTIONS`.) `.env.local.loadtest` is git-ignored; only the
`.example` template is committed.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
