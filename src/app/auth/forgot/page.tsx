import { Suspense } from "react"
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm"

export default function ForgotPasswordPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16 outline-none">
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter the email on your reviewer account and we&apos;ll send a reset link.
      </p>
      <Suspense fallback={null}>
        <ForgotPasswordForm />
      </Suspense>
    </main>
  )
}