// Server component — validates temp OAuth cookie before showing the company info form.
// Does NOT import redirect() from next/navigation — avoids navigation.react-server.js
// in the RSC bundle (OneDrive cloud-file issue with the .map source map).
import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import Link from 'next/link'
import CompanyInfoForm from '@/components/auth/CompanyInfoForm'

const JWT_SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET || 'quoteflow-ai-secret-key-change-in-production'
)

export default async function OnboardingPage() {
  const cookieStore = await cookies()
  const tempToken = cookieStore.get('oauth_signup_temp')?.value

  // No temp cookie — session expired or user arrived directly
  if (!tempToken) {
    return <SessionExpiredMessage />
  }

  // Validate JWT signature and expiry
  try {
    await jwtVerify(tempToken, JWT_SECRET_KEY)
  } catch {
    return <SessionExpiredMessage />
  }

  return (
    <section className="flex w-full items-center justify-center">
      <CompanyInfoForm />
    </section>
  )
}

/** Shown when the oauth_signup_temp cookie is missing or expired */
function SessionExpiredMessage() {
  return (
    <section className="flex w-full items-center justify-center">
      <div className="text-center space-y-4 max-w-sm">
        <p className="text-foreground font-medium">Session expired</p>
        <p className="text-sm text-muted-foreground">
          Your sign-up session has expired. Please start again.
        </p>
        <Link
          href="/signup"
          className="inline-block px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Back to sign up
        </Link>
      </div>
    </section>
  )
}
