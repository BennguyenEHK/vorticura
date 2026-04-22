import AuthForm from "@/components/auth/AuthForm"

// =============================================
// Login Page
// =============================================
// Reads ?error= from URL (set by OAuth callbacks) and surfaces it in the form.
// searchParams is async in Next.js 15 App Router.
const LoginPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) => {
  const { error } = await searchParams

  return (
    <section className="flex w-full items-center justify-center">
      <AuthForm type="login" initialError={error} />
    </section>
  )
}

export default LoginPage
