import { Suspense } from "react"
import { NewPasswordForm } from "@/components/auth/NewPasswordForm"

export default function ResetPasswordPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16 outline-none">
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your reset link has been verified. Pick a password of at least 8 characters.
      </p>
      <Suspense fallback={null}>
        <NewPasswordForm />
      </Suspense>
    </main>
  )
}