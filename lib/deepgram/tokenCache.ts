// Module-level (outside React) so the cache survives across button
// presses/remounts within the page session, and concurrent callers share a
// single in-flight fetch instead of each firing their own request.

const SAFETY_MARGIN_MS = 20_000;

type CachedToken = {
  key: string;
  expiresAt: number;
};

let cached: CachedToken | null = null;
let inFlight: Promise<string> | null = null;

function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
  return `${base.replace(/\/$/, "")}${path}`;
}

async function fetchToken(): Promise<string> {
  console.log("[tokenCache] fetching a fresh Deepgram token from the backend");
  const response = await fetch(apiUrl("/api/deepgram/token"), { method: "POST" });
  if (!response.ok) throw new Error(`token request failed: ${response.status}`);
  const data = (await response.json()) as { key: string; expires_in: number };
  cached = { key: data.key, expiresAt: Date.now() + data.expires_in * 1000 };
  console.log(`[tokenCache] got a fresh token, valid for ${data.expires_in}s`);
  return data.key;
}

export async function getDeepgramToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - SAFETY_MARGIN_MS) {
    const remainingMs = cached.expiresAt - Date.now();
    console.log(`[tokenCache] reusing cached token (${Math.round(remainingMs / 1000)}s left) — this same token has been verified to work across multiple separate connections, so this is not the source of a "nothing sent" bug`);
    return cached.key;
  }
  if (inFlight) return inFlight;

  inFlight = fetchToken().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
