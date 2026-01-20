import AuthForm from "@/components/auth/AuthForm"

// =============================================
// Signup Page
// =============================================
// Server component that renders the signup form
// Uses the reusable AuthForm component in "signup" mode
const SignupPage = () => {
  return (
    <section className="flex w-full items-center justify-center">
      {/* AuthForm component configured for signup mode */}
      <AuthForm type="signup" />
    </section>
  )
}

export default SignupPage
