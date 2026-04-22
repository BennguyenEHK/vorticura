import AuthForm from "@/components/auth/AuthForm"

// =============================================
// Signup Page
// =============================================
// Reads ?error= from URL (set by OAuth callbacks, e.g. "Account already exists")
// and surfaces it in the form via initialError prop.
// searchParams is async in Next.js 15 App Router.
const SignupPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) => {
  const { error } = await searchParams

  return (
    <section className="flex w-full items-center justify-center">
      <AuthForm type="signup" initialError={error} />
    </section>
  )
}

export default SignupPage
