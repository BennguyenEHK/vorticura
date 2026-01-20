"use client"

import * as React from "react"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import {
  Controller,
  ControllerProps,
  FieldPath,
  FieldValues,
  FormProvider,
  useFormContext,
} from "react-hook-form"
import { Label } from "@/components/ui/label"

// Utility function to merge Tailwind classes safely
function cn(...inputs: (string | undefined | null | boolean)[]) {
  return twMerge(clsx(inputs))
}

// Form provider wrapper - exports React Hook Form's FormProvider
const Form = FormProvider

// Context for managing form field state
type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> = {
  name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
)

// FormField component wraps React Hook Form's Controller
const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

// Hook to access form field context and state
const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState, formState } = useFormContext()

  const fieldState = getFieldState(fieldContext.name, formState)

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>")
  }

  const { id } = itemContext

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

// Context for managing form item IDs (accessibility)
type FormItemContextValue = {
  id: string
}

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
)

// FormItem container for form field elements
const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const id = React.useId() // Generate unique ID for accessibility

  return (
    <FormItemContext.Provider value={{ id }}>
      <div
        ref={ref}
        className={cn("space-y-2", className)}
        {...props}
      />
    </FormItemContext.Provider>
  )
})
FormItem.displayName = "FormItem"

// FormLabel connects label to input via htmlFor
const FormLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField()

  return (
    <Label
      ref={ref}
      className={cn(error && "text-red-500", className)}
      htmlFor={formItemId}
      {...props}
    />
  )
})
FormLabel.displayName = "FormLabel"

// FormControl clones child input and injects accessibility props
const FormControl = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()

  // Clone the child element (input) and inject id and aria attributes
  const childWithProps = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: formItemId, // Pass id to actual input for label association
        "aria-describedby": !error
          ? formDescriptionId
          : `${formDescriptionId} ${formMessageId}`,
        "aria-invalid": !!error,
      })
    : children

  return (
    <div ref={ref} {...props}>
      {childWithProps}
    </div>
  )
})
FormControl.displayName = "FormControl"

// FormDescription for helper text below inputs
const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField()

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn("text-sm text-slate-500", className)}
      {...props}
    />
  )
})
FormDescription.displayName = "FormDescription"

// FormMessage displays validation error messages
const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error?.message) : children

  // Don't render if no error message
  if (!body) {
    return null
  }

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn("text-sm font-medium text-red-500", className)}
      role="alert" // Accessibility: announce error to screen readers
      {...props}
    >
      {body}
    </p>
  )
})
FormMessage.displayName = "FormMessage"

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
}
