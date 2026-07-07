// Known infrastructure contracts shown on the /admin/contracts page for
// bulk-registering into the dpm-api registry.
//
// Each contract has a fixed name + contract_type; only the *address* is
// environment-specific. The defaults below are Polygon Amoy *testnet*
// addresses (mirrored from the contract-tester, prediction-onchain-actions).
//
// Override per contract via the NEXT_PUBLIC_CONTRACT_* env vars (inlined
// client-side). It's all-or-nothing: set every one for production, or none to
// use the testnet defaults. A partial set is a misconfiguration and surfaces
// as an error.

export type KnownContract = { address: string; name: string; contract_type: string };

// envKey is kept as a literal string for error messages; override is the
// literal process.env read so Next can statically inline it client-side.
const CATALOG: {
  name: string;
  contract_type: string;
  testnet: string;
  envKey: string;
  override: string | undefined;
}[] = [
  {
    name: "USDC.e",
    contract_type: "usdc_e",
    testnet: "0x9b4A302A548c7e313c2b74C461db7b84d3074A84",
    envKey: "NEXT_PUBLIC_CONTRACT_USDC_E",
    override: process.env.NEXT_PUBLIC_CONTRACT_USDC_E,
  },
  {
    name: "Conditional Tokens",
    contract_type: "conditional_tokens",
    testnet: "0x41cf0Cc822DDA607457cc5429FeEAc62A1Fb0ec1",
    envKey: "NEXT_PUBLIC_CONTRACT_CONDITIONAL_TOKENS",
    override: process.env.NEXT_PUBLIC_CONTRACT_CONDITIONAL_TOKENS,
  },
  {
    name: "CTF Exchange",
    contract_type: "ctf_exchange",
    testnet: "0xF740e33A790E31745CdCaC2e173E7B4585C172F9",
    envKey: "NEXT_PUBLIC_CONTRACT_CTF_EXCHANGE",
    override: process.env.NEXT_PUBLIC_CONTRACT_CTF_EXCHANGE,
  },
  {
    name: "Fee Module",
    contract_type: "fee_module",
    testnet: "0xE34B1b9f36e8779546cE212f968e36916b9E1576",
    envKey: "NEXT_PUBLIC_CONTRACT_FEE_MODULE",
    override: process.env.NEXT_PUBLIC_CONTRACT_FEE_MODULE,
  },
  {
    name: "UMA CTF Adapter",
    contract_type: "uma_ctf_adapter",
    testnet: "0xA27381a00A41fBb8f44Ee36884EeDD521895817c",
    envKey: "NEXT_PUBLIC_CONTRACT_UMA_CTF_ADAPTER",
    override: process.env.NEXT_PUBLIC_CONTRACT_UMA_CTF_ADAPTER,
  },
  {
    name: "Managed Oracle",
    contract_type: "managed_oracle",
    testnet: "0xd4A98869e9711338535AfE76EB736a1127cbA60f",
    envKey: "NEXT_PUBLIC_CONTRACT_MANAGED_ORACLE",
    override: process.env.NEXT_PUBLIC_CONTRACT_MANAGED_ORACLE,
  },
  {
    name: "CTF Oracle",
    contract_type: "ctf_oracle",
    testnet: "0xbab7940F8a713C4e64CbCfeEC85FEDb8fEecC225",
    envKey: "NEXT_PUBLIC_CONTRACT_CTF_ORACLE",
    override: process.env.NEXT_PUBLIC_CONTRACT_CTF_ORACLE,
  },
  {
    name: "Treasury",
    contract_type: "treasury",
    testnet: "0x5D525Ab2C7F2eEEB345972405005949F69de08bA",
    envKey: "NEXT_PUBLIC_CONTRACT_TREASURY",
    override: process.env.NEXT_PUBLIC_CONTRACT_TREASURY,
  },
  {
    name: "Relay Hub",
    contract_type: "relay_hub",
    testnet: "0xcfed328256B3b71a0C942A7FC8B560B598536b5d",
    envKey: "NEXT_PUBLIC_CONTRACT_RELAY_HUB",
    override: process.env.NEXT_PUBLIC_CONTRACT_RELAY_HUB,
  },
];

export type KnownContractsResult = {
  contracts: KnownContract[];
  // true when using the built-in testnet addresses (no override present).
  isDefault: boolean;
  // non-null when the override is partial (some set, some missing).
  error: string | null;
};

const isSet = (v: string | undefined): v is string => !!v && v.trim() !== "";

// getKnownContracts resolves the contract list from the env overrides:
//   - none set      → testnet defaults (isDefault: true)
//   - all set       → env override     (isDefault: false)
//   - partially set → error (lists the missing keys); falls back to testnet
export function getKnownContracts(): KnownContractsResult {
  const setCount = CATALOG.filter((e) => isSet(e.override)).length;

  if (setCount === 0) {
    return {
      contracts: CATALOG.map((e) => ({
        address: e.testnet,
        name: e.name,
        contract_type: e.contract_type,
      })),
      isDefault: true,
      error: null,
    };
  }

  if (setCount === CATALOG.length) {
    return {
      contracts: CATALOG.map((e) => ({
        address: (e.override as string).trim(),
        name: e.name,
        contract_type: e.contract_type,
      })),
      isDefault: false,
      error: null,
    };
  }

  const missing = CATALOG.filter((e) => !isSet(e.override)).map((e) => e.envKey);
  return {
    contracts: [],
    isDefault: true,
    error: `Partial contract override: ${setCount}/${CATALOG.length} set. Either set all or none. Missing: ${missing.join(", ")}.`,
  };
}
