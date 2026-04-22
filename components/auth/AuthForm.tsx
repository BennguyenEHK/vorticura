"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
// Icon imports for password visibility toggle
import { Eye, EyeOff } from "lucide-react"

// UI Components
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

// Validation schemas (relocated from lib/utils/validation)
import { loginSchema, signupSchema, type LoginFormData, type SignupFormData } from "@/lib/utils/validation/schemas"

// Server action for OAuth redirect
import { getOAuthRedirectUrl } from "@/lib/actions/email-connection-actions"

// =============================================
// AuthForm Props Interface
// =============================================
interface AuthFormProps {
  type: "login" | "signup"       // Determines form mode
  initialError?: string          // Pre-populated error from OAuth redirect (?error= param)
}

// Union type for form data based on auth type
type AuthFormData = LoginFormData | SignupFormData

// =============================================
// AuthForm Component
// =============================================
// Reusable authentication form that switches between login and signup modes
// Uses React Hook Form with Zod validation for type-safe form handling
const AuthForm = ({ type, initialError }: AuthFormProps) => {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  // initialError surfaces OAuth redirect errors (?error= from callback)
  const [error, setError] = useState<string | null>(initialError ?? null)
  // State for password visibility toggle (eye icon button)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  // State for OAuth loading (tracks which provider is in progress)
  const [oauthLoading, setOauthLoading] = useState<string | null>(null)

  // Determine which schema to use based on form type
  const formSchema = type === "login" ? loginSchema : signupSchema

  // Initialize React Hook Form with Zod resolver
  // Default values match the schema structure for each form type
  const form = useForm<AuthFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: type === "login"
      ? { identifier: "", password: "" }
      : {
          username: "",
          fullName: "",
          email: "",
          password: "",
          confirmPassword: "",
          companyName: "",
          companyEmail: "",
          companyAddress: "",
          companyNumber: "",
          companyFax: "",
        },
  })

  // Form submission handler
  const onSubmit = async (data: AuthFormData) => {
    setIsLoading(true)
    setError(null)

    try {
      // Determine API endpoint based on form type
      const endpoint = type === "login" ? "/api/auth/login" : "/api/auth/signup"

      // Transform data for API (frontend uses camelCase, backend uses snake_case)
      let apiData: Record<string, string | boolean | undefined>
      if (type === "signup") {
        const signupData = data as SignupFormData
        apiData = {
          username: signupData.username,
          full_name: signupData.fullName,
          email: signupData.email,
          password: signupData.password,
          company_name: signupData.companyName,
          company_email: signupData.companyEmail || undefined,
          company_address: signupData.companyAddress || undefined,
          company_number: signupData.companyNumber || undefined,
          company_fax: signupData.companyFax || undefined,
        }
      } else {
        // Login: send identifier and password; server will auto-detect email vs username
        const loginData = data as LoginFormData
        apiData = {
          identifier: loginData.identifier,
          password: loginData.password,
        }
      }

      // POST to /api/auth/login or /api/auth/signup based on form type
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiData),
      })

      const result = await response.json()

      // Handle API errors
      if (!response.ok) {
        setError(result.error || result.message || "Authentication failed. Please try again.")
        return
      }

      // Redirect on success
      if (type === "login") {
        // Redirect to previous location or dashboard after login
        router.push(result.redirect_to ?? '/dashboard')
        router.refresh() // Refresh to update auth state
      } else {
        // Redirect to login after signup
        router.push("/login")
      }
    } catch (err) {
      // Handle network or unexpected errors
      setError("An unexpected error occurred. Please try again.")
      console.error("Auth error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  // OAuth login/signup handler
  const handleOAuthLogin = async (provider: 'gmail' | 'outlook') => {
    setOauthLoading(provider)
    try {
      const url = await getOAuthRedirectUrl(provider, type)
      window.location.href = url
    } catch {
      setError('Failed to start OAuth flow. Please try again.')
      setOauthLoading(null)
    }
  }

  // Configuration based on form type
  const config = {
    login: {
      title: "Welcome back",
      description: "Enter your credentials to access your account",
      buttonText: "Sign In",
      footerText: "Don't have an account?",
      footerLinkText: "Sign up",
      footerLinkHref: "/signup",
    },
    signup: {
      title: "Create an account",
      description: "Enter your details to get started",
      buttonText: "Create Account",
      footerText: "Already have an account?",
      footerLinkText: "Sign in",
      footerLinkHref: "/login",
    },
  }

  const { title, description, buttonText, footerText, footerLinkText, footerLinkHref } = config[type]

  return (
    <Card className="w-full max-w-lg shadow-lg">
      <CardHeader className="space-y-1 text-center">
        {/* Form Title */}
        <CardTitle className="text-2xl font-bold tracking-tight">
          {title}
        </CardTitle>
        {/* Form Description */}
        <CardDescription>
          {description}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {/* Error Alert (using design tokens) */}
        {error && (
          <div
            className="mb-4 rounded-lg border border-error-border bg-error-bg p-3 text-sm text-error"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        )}

        {/* OAuth Buttons */}
        <div className="space-y-3 mb-4">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => handleOAuthLogin('gmail')}
            disabled={oauthLoading !== null || isLoading}
          >
            {oauthLoading === 'gmail' ? (
              'Redirecting...'
            ) : (
              <>
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {type === 'signup' ? 'Sign up with Google' : 'Log in with Google'}
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => handleOAuthLogin('outlook')}
            disabled={oauthLoading !== null || isLoading}
          >
            {oauthLoading === 'outlook' ? (
              'Redirecting...'
            ) : (
              <>
                <svg className="mr-2 h-4 w-4" viewBox="0 0 23 23">
                  <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                  <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
                  <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
                  <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
                </svg>
                {type === 'signup' ? 'Sign up with Microsoft' : 'Log in with Microsoft'}
              </>
            )}
          </Button>
        </div>

        {/* Divider */}
        <div className="relative py-2 mb-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* ===== SIGNUP ONLY: User Credentials Section ===== */}
            {type === "signup" && (
              <>
                {/* Username Field */}
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="johndoe"
                          autoComplete="username"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Full Name Field */}
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Nguyen Quang Huy"
                          autoComplete="name"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {/* ===== LOGIN ONLY: Identifier Field (email or username) ===== */}
            {type === "login" && (
              <FormField
                control={form.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email or Username</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="you@example.com or johndoe"
                        autoComplete="username"
                        disabled={isLoading}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* ===== SIGNUP ONLY: Email Field ===== */}
            {type === "signup" && (
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        disabled={isLoading}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Password Field with visibility toggle */}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    {/* Wrapper div for input and toggle button positioning */}
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        autoComplete={type === "login" ? "current-password" : "new-password"}
                        disabled={isLoading}
                        className="pr-10" // Padding for toggle button
                        {...field}
                      />
                      {/* Toggle button - shows/hides password */}
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={isLoading}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ===== SIGNUP ONLY: Confirm Password with visibility toggle ===== */}
            {type === "signup" && (
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      {/* Wrapper div for input and toggle button positioning */}
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="••••••••"
                          autoComplete="new-password"
                          disabled={isLoading}
                          className="pr-10" // Padding for toggle button
                          {...field}
                        />
                        {/* Toggle button - shows/hides confirm password */}
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          disabled={isLoading}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                          aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                          tabIndex={-1}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* ===== SIGNUP ONLY: Company Information Section ===== */}
            {type === "signup" && (
              <>
                {/* Section Divider (using design tokens) */}
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Company Information</span>
                  </div>
                </div>

                {/* Company Name (Required) */}
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Acme Corporation"
                          autoComplete="organization"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Company Email (Optional) */}
                <FormField
                  control={form.control}
                  name="companyEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="contact@company.com"
                          autoComplete="email"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Company Address (Optional) */}
                <FormField
                  control={form.control}
                  name="companyAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="123 Business St, City, Country"
                          autoComplete="street-address"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Company Phone and Fax (side by side) */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Company Phone Number (Optional) */}
                  <FormField
                    control={form.control}
                    name="companyNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            placeholder="+1 234 567 890"
                            autoComplete="tel"
                            disabled={isLoading}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Company Fax Number (Optional) */}
                  <FormField
                    control={form.control}
                    name="companyFax"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fax Number</FormLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            placeholder="+1 234 567 891"
                            autoComplete="fax"
                            disabled={isLoading}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={isLoading}
            >
              {buttonText}
            </Button>
          </form>
        </Form>

        {/* Footer with link to alternate auth page (using design tokens) */}
        <div className="mt-6 text-center text-sm">
          <span className="text-muted-foreground">{footerText} </span>
          <Link
            href={footerLinkHref}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {footerLinkText}
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

export default AuthForm
