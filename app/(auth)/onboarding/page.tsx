// Server component — validates temp OAuth cookie before showing form
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { jwtVerify } from 'jose'
import CompanyInfoForm from '@/components/auth/CompanyInfoForm'

const JWT_SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET || 'quoteflow-ai-secret-key-change-in-production'
)

export default async function OnboardingPage() {
  const cookieStore = await cookies()
  const tempToken = cookieStore.get('oauth_signup_temp')?.value

  if (!tempToken) {
    redirect('/signup?error=' + encodeURIComponent('Session expired. Please sign up again.'))
  }

  try {
    await jwtVerify(tempToken, JWT_SECRET_KEY)
  } catch {
    redirect('/signup?error=' + encodeURIComponent('Session expired. Please sign up again.'))
  }

  return (
    <section className="flex w-full items-center justify-center">
      <CompanyInfoForm />
    </section>
  )
}
