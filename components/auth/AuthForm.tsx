"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

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
import { loginSchema, signupSchema, type LoginFormData, type SignupFormData } from "@/lib/utils/validation/schemas"

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
  const form = useForm<AuthFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: type === "login"
      ? { email: "", password: "" }
      : { firstName: "", lastName: "", email: "", password: "", confirmPassword: "" },
  })

  // Form submission handler
  const onSubmit = async (data: AuthFormData) => {
    setIsLoading(true)
    setError(null)

    try {
      // Determine API endpoint based on form type
      const endpoint = type === "login" ? "/api/auth/login" : "/api/auth/signup"

      // Send request to auth API
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      // Handle API errors
      if (!response.ok) {
        setError(result.message || "Authentication failed. Please try again.")
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
    <Card className="w-full max-w-md shadow-lg">
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
            {/* Signup-only fields: First and Last Name */}
            {type === "signup" && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="John"
                          autoComplete="given-name"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Doe"
                          autoComplete="family-name"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Email Field */}
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

            {/* Signup-only: Confirm Password Field */}
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
