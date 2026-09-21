// Provider glyphs for the public auth screens. Sign-in and register share this
// one definition — never fork a second copy per screen (08 §3).
//
// These are owned brand marks with FIXED brand colors, a deliberate exception to
// the "no raw hex in components" rule: no design token can describe a third
// party's identity, and recoloring them to --primary would misrepresent the
// provider. 08 §6 QA allows this class of literal.
export type OAuthProvider = "google" | "facebook" | "apple"

const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  google: "Google",
  facebook: "Facebook",
  apple: "Apple",
}

export function providerLabel(provider: OAuthProvider): string {
  return PROVIDER_LABEL[provider]
}

export function ProviderGlyph({
  provider,
  className = "size-4 shrink-0",
}: {
  provider: OAuthProvider
  className?: string
}) {
  if (provider === "google") {
    return (
      <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
    )
  }
  if (provider === "facebook") {
    return (
      <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
        <circle cx="24" cy="24" r="22" fill="#1877F2" />
        <path
          fill="#fff"
          d="M26.5 39v-12h4l.7-4.7h-4.7V19.9c0-1.4.4-2.4 2.5-2.4h2.7v-4.2c-.5-.1-2.1-.2-4-.2-4 0-6.7 2.4-6.7 6.9v3.9H16.9V27h4v12h5.6z"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.86-3.08.38-1.09-.5-2.08-.53-3.2 0-1.4.68-2.13.49-2.96-.38C2.79 15.25 3.51 6.59 9.6 6.39c1.32.04 2.25.72 3.02.77 1.16-.23 2.27-.9 3.48-.81 1.47.12 2.58.7 3.31 1.73-3.04 1.83-2.33 5.86.21 6.99-.56 1.46-1.27 2.91-2.57 4.2zM12.03 6.24c-.14-2.26 1.85-4.19 4.06-4.32.29 2.27-1.93 4.3-4.06 4.32z" />
    </svg>
  )
}
