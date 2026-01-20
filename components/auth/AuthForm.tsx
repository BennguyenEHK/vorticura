"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

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

// Validation schemas
import { loginSchema, signupSchema, isEmail, type LoginFormData, type SignupFormData } from "@/lib/utils/validation/schemas"

// =============================================
// AuthForm Props Interface
// =============================================
interface AuthFormProps {
  type: "login" | "signup" // Determines form mode
}

// Union type for form data based on auth type
type AuthFormData = LoginFormData | SignupFormData

// =============================================
// AuthForm Component
// =============================================
// Reusable authentication form that switches between login and signup modes
// Uses React Hook Form with Zod validation for type-safe form handling
const AuthForm = ({ type }: AuthFormProps) => {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          email: signupData.email,
          password: signupData.password,
          company_name: signupData.companyName,
          company_email: signupData.companyEmail || undefined,
          company_address: signupData.companyAddress || undefined,
          company_number: signupData.companyNumber || undefined,
          company_fax: signupData.companyFax || undefined,
        }
      } else {
        // Login: transform identifier to identifier + isEmail flag
        const loginData = data as LoginFormData
        apiData = {
          identifier: loginData.identifier,
          password: loginData.password,
          isEmail: isEmail(loginData.identifier), // Auto-detect if email or username
        }
      }

      // Send request to auth API  change to use  /api/auth/login/route.ts ( POST function)  or /api/auth/signup/route.ts
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
        // Redirect to dashboard after login
        router.push("/")
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
        {/* Error Alert */}
        {error && (
          <div
            className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        )}

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
              </>
            )}

            {/* Identifier Field (email or username - both login and signup) */}
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

            {/* Password Field */}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      autoComplete={type === "login" ? "current-password" : "new-password"}
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ===== SIGNUP ONLY: Confirm Password ===== */}
            {type === "signup" && (
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        autoComplete="new-password"
                        disabled={isLoading}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* ===== SIGNUP ONLY: Company Information Section ===== */}
            {type === "signup" && (
              <>
                {/* Section Divider */}
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-slate-500">Company Information</span>
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

        {/* Footer with link to alternate auth page */}
        <div className="mt-6 text-center text-sm">
          <span className="text-slate-500">{footerText} </span>
          <Link
            href={footerLinkHref}
            className="font-medium text-slate-900 underline-offset-4 hover:underline"
          >
            {footerLinkText}
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

export default AuthForm
