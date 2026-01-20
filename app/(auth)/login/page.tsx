import AuthForm from "@/components/auth/AuthForm"

// =============================================
// Login Page
// =============================================
// Server component that renders the login form
// Uses the reusable AuthForm component in "login" mode
const LoginPage = () => {
  return (
    <section className="flex w-full items-center justify-center">
      {/* AuthForm component configured for login mode */}
      <AuthForm type="login" />
    </section>
  )
}

export default LoginPage
