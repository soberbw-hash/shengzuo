export const getUserErrorMessage = (
  error: unknown,
  fallback: string,
): string => {
  if (!(error instanceof Error)) return fallback;

  const clean = (message: string): string => {
    let cleaned = message.trim();
    let previous = "";

    while (cleaned && cleaned !== previous) {
      previous = cleaned;
      cleaned = cleaned
        .replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/u, "")
        .replace(/^Error:\s*/u, "")
        .trim();
    }

    return cleaned;
  };

  const message = clean(error.message);
  const unhelpfulMessages = new Set(["", "Error", "[object Object]"]);
  if (!unhelpfulMessages.has(message)) return message;

  if (error.cause instanceof Error) {
    return getUserErrorMessage(error.cause, fallback);
  }

  return fallback;
};
