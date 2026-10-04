/**
 * Where this console is pointed, validated once at startup.
 *
 * Three values decide what every page shows. If one of them is missing or
 * malformed the console says which, rather than quietly reading somebody else's
 * contract or rendering "undefined" into a page about verifiable claims.
 */
import { z } from "zod";

const schema = z.object({
  network: z.literal("studio-next"),
  chainId: z.coerce.number().int().positive(),
  contractAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a contract address"),
});

export type Config = z.infer<typeof schema>;

export type ConfigResult =
  | { ok: true; config: Config }
  | { ok: false; problems: { variable: string; expected: string; found: string }[] };

const RAW = {
  network: process.env.NEXT_PUBLIC_GENLAYER_NETWORK,
  chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
  contractAddress: process.env.NEXT_PUBLIC_SPECLOCK_CONTRACT_ADDRESS,
};

const VARIABLE: Record<string, string> = {
  network: "NEXT_PUBLIC_GENLAYER_NETWORK",
  chainId: "NEXT_PUBLIC_CHAIN_ID",
  contractAddress: "NEXT_PUBLIC_SPECLOCK_CONTRACT_ADDRESS",
};

const EXPECTED: Record<string, string> = {
  network: 'the string "studio-next"',
  chainId: "the chain id, 61997",
  contractAddress: "a 0x address, 40 hex characters",
};

function read(): ConfigResult {
  const parsed = schema.safeParse(RAW);
  if (parsed.success) return { ok: true, config: parsed.data };
  const seen = new Set<string>();
  const problems = parsed.error.issues.map((issue) => {
    const key = String(issue.path[0] ?? "");
    seen.add(key);
    const found = RAW[key as keyof typeof RAW];
    return {
      variable: VARIABLE[key] ?? key,
      expected: EXPECTED[key] ?? "a value",
      found: found === undefined || found === "" ? "not set" : String(found),
    };
  });
  return { ok: false, problems };
}

export const configResult = read();

/** The explorer, derived rather than configured: one fewer thing to get wrong. */
export const EXPLORER = "https://explorer-studio-dev.genlayer.com";

export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (address: string) => `${EXPLORER}/address/${address}`;
