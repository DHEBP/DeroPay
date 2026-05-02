This is the DeroPay demo storefront built with Next.js.

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

## Wallet Connector Modes

The demo keeps XSWD as the default connector path.

- Default behavior: open checkout normally and use XSWD.
- Experimental WASM mode:
  1. Set `NEXT_PUBLIC_DEROPAY_EXPERIMENTAL_WASM=true`.
  2. Open checkout with `?wallet=wasm` (example: `/checkout?wallet=wasm`).
  3. The demo will force the WASM connector path and show an advanced warning.

Notes:
- WASM remains an advanced/experimental connector.
- There is no silent fallback from XSWD to WASM.
- In demo mode, WASM spend operations are policy-disabled by default.

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
