import { z } from "zod"

// =============================================
// Authentication Validation Schemas
// =============================================
// Zod schemas for validating auth form inputs
// Used with React Hook Form for client-side validation

// Email validation with proper format checking
const emailSchema = z
  .string()
  .min(1, { message: "Email is required" }) // Required field
  .email({ message: "Please enter a valid email address" }) // Email format

// Password validation with security requirements
const passwordSchema = z
  .string()
  .min(1, { message: "Password is required" }) // Required field
  .min(8, { message: "Password must be at least 8 characters" }) // Minimum length

// Name validation for signup fields
const nameSchema = z
  .string()
  .min(1, { message: "This field is required" })
  .min(2, { message: "Must be at least 2 characters" })
  .max(50, { message: "Must be less than 50 characters" })

// Login form schema - email and password only
export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

// Signup form schema - includes name fields
export const signupSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, { message: "Please confirm your password" }),
}).refine((data) => data.password === data.confirmPassword, {
  // Custom validation: passwords must match
  message: "Passwords do not match",
  path: ["confirmPassword"], // Error appears on confirmPassword field
})

// Type inference from schemas for TypeScript support
export type LoginFormData = z.infer<typeof loginSchema>
export type SignupFormData = z.infer<typeof signupSchema>

// Dynamic schema factory based on auth mode
// Returns appropriate schema for login or signup
export const authFormSchema = (type: "login" | "signup") => {
  if (type === "login") {
    return loginSchema
  }
  return signupSchema
}

// Export individual field schemas for reuse
export { emailSchema, passwordSchema, nameSchema }
