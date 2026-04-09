'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { upsertPrevLocation } from '@/lib/actions/session-actions'

/**
 * LocationTracker - Client component that tracks user navigation
 * Automatically updates the previous location in user_sessions table
 * Used for session redirect after login
 */
export function LocationTracker() {
  const pathname = usePathname()

  useEffect(() => {
    // Track location change
    upsertPrevLocation(pathname)
  }, [pathname])

  // No UI — purely a tracking component
  return null
}
