import { Suspense } from "react"
import { NewPasswordForm } from "@/components/auth/NewPasswordForm"

export default function ResetPasswordPage() {
  return (
    <main id="main" tabIndex={-1} className="flex-1 bg-brand-gradient outline-none">
      <div className="mx-auto flex w-full max-w-sm flex-col justify-center px-5 py-16 md:px-8">
        <h1 className="text-h1 font-bold tracking-tight">Choose a new password</h1>
        <p className="mt-1 text-body text-muted-foreground">
          Your reset link has been verified. Pick a password of at least 8 characters.
        </p>
        <Suspense fallback={null}>
          <NewPasswordForm />
        </Suspense>
      </div>
    </main>
  )
}