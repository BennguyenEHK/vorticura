"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

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

import { companyInfoSchema, type CompanyInfoFormData } from "@/lib/utils/validation/schemas"
import { completeOAuthSignup } from "@/lib/actions/oauth-signup-actions"

const CompanyInfoForm = () => {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<CompanyInfoFormData>({
    resolver: zodResolver(companyInfoSchema),
    defaultValues: {
      companyName: "",
      companyEmail: "",
      companyAddress: "",
      companyNumber: "",
      companyFax: "",
    },
  })

  const onSubmit = async (data: CompanyInfoFormData) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await completeOAuthSignup(data)
      if (!result.success) {
        setError(result.error || "Failed to complete signup. Please try again.")
        return
      }
      router.push("/dashboard")
      router.refresh()
    } catch {
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-lg shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">
          Almost there!
        </CardTitle>
        <CardDescription>
          Tell us about your company to complete your account setup
        </CardDescription>
      </CardHeader>

      <CardContent>
        {error && (
          <div
            className="mb-4 rounded-lg border border-error-border bg-error-bg p-3 text-sm text-error"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

            {/* Company Email */}
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

            {/* Company Address */}
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

            {/* Phone and Fax side by side */}
            <div className="grid grid-cols-2 gap-4">
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

            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={isLoading}
            >
              Complete Setup
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

export default CompanyInfoForm
