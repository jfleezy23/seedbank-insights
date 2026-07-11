export const USER_CANCELLED_REQUEST_MESSAGE = "Request cancelled by user.";

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error === null || error === undefined) return "";
  return String(error);
}

export function humanizeErrorMessage(error: unknown, fallback: string): string {
  const message = errorText(error)
    .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, "")
    .trim();
  if (isUserCancelledRequest(message)) return USER_CANCELLED_REQUEST_MESSAGE;
  return message || fallback;
}

export function isUserCancelledRequest(error: unknown): boolean {
  const message = errorText(error);
  return /request cancel(?:led|ed)(?: by user)?/i.test(message) || /openai request cancel(?:led|ed)/i.test(message);
}
