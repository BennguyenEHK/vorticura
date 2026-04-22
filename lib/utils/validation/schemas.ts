import { z } from "zod"

// =============================================
// Authentication Validation Schemas
// =============================================
// Zod schemas for validating auth form inputs
// Used with React Hook Form for client-side validation

// Helper function to detect if a string is an email
export const isEmail = (value: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(value)
}

// Email validation with proper format checking
const emailSchema = z
  .string()
  .min(1, { message: "Email is required" }) // Required field
  .email({ message: "Please enter a valid email address" }) // Email format

// Optional email schema (for company email)
const optionalEmailSchema = z
  .string()
  .email({ message: "Please enter a valid email address" })
  .or(z.literal(""))
  .optional() // Allow undefined

// Password validation with security requirements
const passwordSchema = z
  .string()
  .min(1, { message: "Password is required" }) // Required field
  .min(8, { message: "Password must be at least 8 characters" }) // Minimum length

// Username validation (3-50 characters, alphanumeric and underscores)
const usernameSchema = z
  .string()
  .min(1, { message: "Username is required" })
  .min(3, { message: "Username must be at least 3 characters" })
  .max(50, { message: "Username must be less than 50 characters" })
  .regex(/^[a-zA-Z0-9_]+$/, { message: "Username can only contain letters, numbers, and underscores" })

// Company name validation (required, 2-255 characters)
const companyNameSchema = z
  .string()
  .min(1, { message: "Company name is required" })
  .min(2, { message: "Company name must be at least 2 characters" })
  .max(255, { message: "Company name must be less than 255 characters" })

// Phone/Fax number validation (optional, max 50 characters)
const phoneSchema = z
  .string()
  .max(50, { message: "Phone number must be less than 50 characters" })
  .regex(/^[\d\s\-\+\(\)]*$/, { message: "Invalid phone number format" })
  .optional()
  .or(z.literal("")) // Allow empty string

// Fax number validation (optional, max 50 characters)
const faxSchema = z
  .string()
  .max(50, { message: "Fax number must be less than 50 characters" })
  .regex(/^[\d\s\-\+\(\)]*$/, { message: "Invalid fax number format" })
  .optional()
  .or(z.literal("")) // Allow empty string

// Address validation (optional, text field)
const addressSchema = z
  .string()
  .max(500, { message: "Address must be less than 500 characters" })
  .optional()
  .or(z.literal("")) // Allow empty string

// Login form schema - identifier (email or username) and password
// Identifier auto-detects whether user entered email or username
export const loginSchema = z.object({
  identifier: z
    .string()
    .min(1, { message: "Email or username is required" })
    .min(3, { message: "Please enter a valid email or username" }),
  password: passwordSchema,
})

// Full name validation (required, for Attn: self-exclusion)
const fullNameSchema = z
  .string()
  .min(1, { message: "Full name is required" })
  .min(2, { message: "Full name must be at least 2 characters" })
  .max(150, { message: "Full name must be less than 150 characters" })
  .regex(/^[\p{L}\s\-'.]+$/u, { message: "Full name can only contain letters, spaces, hyphens, and apostrophes" })

// Signup form schema - user info + company info
export const signupSchema = z.object({
  // User credentials
  username: usernameSchema,
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, { message: "Please confirm your password" }),

  // Company information (required: companyName)
  companyName: companyNameSchema,
  companyEmail: optionalEmailSchema,
  companyAddress: addressSchema,
  companyNumber: phoneSchema,
  companyFax: faxSchema, // Company fax number
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
export {
  emailSchema,
  passwordSchema,
  usernameSchema,
  fullNameSchema,
  companyNameSchema,
  phoneSchema,
  faxSchema,
  addressSchema,
  optionalEmailSchema,
}

// Company info schema for OAuth onboarding (no user credentials needed — from OAuth)
export const companyInfoSchema = z.object({
  companyName: companyNameSchema,
  companyEmail: optionalEmailSchema,
  companyAddress: addressSchema,
  companyNumber: phoneSchema,
  companyFax: faxSchema,
})

export type CompanyInfoFormData = z.infer<typeof companyInfoSchema>
