/** Extract a human-readable message from a Go/dpm-api JSON error body. */
export function parseApiErrorPayload(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "request failed";
  try {
    const parsed = JSON.parse(trimmed) as { error?: string; message?: string };
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error;
    }
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }
  } catch {
    // not JSON — return raw text below
  }
  return trimmed;
}

/** Read `{ error: string }` from a failed browser fetch to our BFF routes. */
export async function readFetchErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  if (text.trim()) {
    return parseApiErrorPayload(text);
  }
  return `Request failed (${res.status})`;
}

/** True when the backoffice rejected a liveness override (oracle minimum, etc.). */
export function isLivenessValidationError(message: string): boolean {
  return /\bliveness\b/i.test(message);
}
