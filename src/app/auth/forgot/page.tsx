import { Suspense } from "react"
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm"

export default function ForgotPasswordPage() {
  return (
    <main id="main" tabIndex={-1} className="flex-1 bg-brand-gradient outline-none">
      <div className="mx-auto flex w-full max-w-sm flex-col justify-center px-5 py-16 md:px-8">
        <h1 className="text-h1 font-bold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-body text-muted-foreground">
          Enter the email on your reviewer account and we&apos;ll send a reset link.
        </p>
        <Suspense fallback={null}>
          <ForgotPasswordForm />
        </Suspense>
      </div>
    </main>
  )
}