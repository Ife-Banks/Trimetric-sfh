// Safe redirect target for auth flows. Only allows same-origin paths, so an
// attacker-supplied `next` query param can never send a user off the app
// (open-redirect). Rejects protocol-relative ("//host") and backslash forms.
export function safeNextPath(value: string | null | undefined): string {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes(":")
  ) {
    return value
  }
  return "/"
}