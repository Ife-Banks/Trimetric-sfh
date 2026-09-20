"use client"

import { useEffect } from "react"

// Registers the app-shell service worker (public/sw.js) in production only.
// In dev the worker would fight Next.js's dev-mode caching, so it's skipped.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failure is non-fatal: the app still works online.
      })
    }
    window.addEventListener("load", onLoad)
    return () => window.removeEventListener("load", onLoad)
  }, [])

  return null
}