// Block-explorer links for on-chain identifiers.
//
// Same convention as lib/known-contracts.ts: the baked-in default is the
// Polygon Amoy *testnet* explorer, overridden for production via
// NEXT_PUBLIC_POLYGONSCAN_BASE_URL. The env read is a literal so Next can
// statically inline it client-side.

const TESTNET_BASE_URL = "https://amoy.polygonscan.com";

const override = process.env.NEXT_PUBLIC_POLYGONSCAN_BASE_URL;

function baseUrl(): string {
  const trimmed = override?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : TESTNET_BASE_URL;
}

export function txUrl(txHash: string): string {
  return `${baseUrl()}/tx/${encodeURIComponent(txHash)}`;
}
