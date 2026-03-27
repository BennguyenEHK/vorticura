'use client'

import { useState, useEffect, useCallback } from 'react'
import { Mail, Plus, Pause, Play, Trash2, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  getEmailConnections,
  getOAuthRedirectUrl,
  pauseEmailConnection,
  resumeEmailConnection,
  disconnectEmailAccount,
} from '@/lib/actions/email-connection-actions'

// =============================================
// Types
// =============================================
interface EmailConnection {
  connectionId: number
  provider: string
  emailAddress: string
  status: string | null
  lastSyncAt: Date | null
  lastError: string | null
  errorCount: number | null
  createdAt: Date | null
}

interface EmailConnectionPanelProps {
  companyId: number
}

// =============================================
// Helpers
// =============================================

/** Format a date as relative time (e.g., "2m ago", "3h ago") */
function formatRelativeTime(date: Date | null): string {
  if (!date) return 'Never'

  const now = new Date()
  const diffMs = now.getTime() - new Date(date).getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

/** Get provider display name */
function getProviderLabel(provider: string): string {
  switch (provider) {
    case 'gmail': return 'Gmail'
    case 'outlook': return 'Outlook'
    default: return provider
  }
}

// =============================================
// Status Badge Component
// =============================================
function StatusBadge({ status }: { status: string | null }) {
  const normalizedStatus = status || 'unknown'

  const config: Record<string, { dot: string; text: string; label: string }> = {
    active: { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', label: 'Active' },
    paused: { dot: 'bg-yellow-500', text: 'text-yellow-700 dark:text-yellow-400', label: 'Paused' },
    expired: { dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400', label: 'Expired' },
    revoked: { dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400', label: 'Revoked' },
    unknown: { dot: 'bg-gray-500', text: 'text-muted-foreground', label: 'Unknown' },
  }

  const { dot, text, label } = config[normalizedStatus] || config.unknown

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${text}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

// =============================================
// EmailConnectionPanel Component
// =============================================
const EmailConnectionPanel = ({ companyId }: EmailConnectionPanelProps) => {
  const [connections, setConnections] = useState<EmailConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  // Fetch connections on mount
  const fetchConnections = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getEmailConnections(companyId)
      setConnections(data)
    } catch (err) {
      console.error('Failed to fetch email connections:', err)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    fetchConnections()
  }, [fetchConnections])

  // Connect a new email account via OAuth
  const handleConnect = async (provider: 'gmail' | 'outlook') => {
    setConnectingProvider(provider)
    try {
      const url = await getOAuthRedirectUrl(provider, 'connect')
      window.location.href = url
    } catch (err) {
      console.error('Failed to get OAuth URL:', err)
      setConnectingProvider(null)
    }
  }

  // Pause a connection
  const handlePause = async (connectionId: number) => {
    setActionLoading(connectionId)
    try {
      await pauseEmailConnection(connectionId, companyId)
      await fetchConnections()
    } catch (err) {
      console.error('Failed to pause connection:', err)
    } finally {
      setActionLoading(null)
    }
  }

  // Resume a connection
  const handleResume = async (connectionId: number) => {
    setActionLoading(connectionId)
    try {
      await resumeEmailConnection(connectionId, companyId)
      await fetchConnections()
    } catch (err) {
      console.error('Failed to resume connection:', err)
    } finally {
      setActionLoading(null)
    }
  }

  // Disconnect (delete) a connection
  const handleDisconnect = async (connectionId: number, emailAddress: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to disconnect ${emailAddress}? This will stop all email syncing for this account.`
    )
    if (!confirmed) return

    setActionLoading(connectionId)
    try {
      await disconnectEmailAccount(connectionId, companyId)
      await fetchConnections()
    } catch (err) {
      console.error('Failed to disconnect account:', err)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Email Integration</CardTitle>
        </div>
        <CardDescription>
          Automatically receive and process RFQs from connected email accounts
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Connect Buttons */}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => handleConnect('gmail')}
            disabled={connectingProvider !== null}
          >
            <Plus className="mr-2 h-4 w-4" />
            {connectingProvider === 'gmail' ? 'Redirecting...' : 'Connect Gmail Account'}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleConnect('outlook')}
            disabled={connectingProvider !== null}
          >
            <Plus className="mr-2 h-4 w-4" />
            {connectingProvider === 'outlook' ? 'Redirecting...' : 'Connect Outlook Account'}
          </Button>
        </div>

        {/* Connected Accounts List */}
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Clock className="mr-2 h-4 w-4 animate-spin" />
            Loading connections...
          </div>
        ) : connections.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/50 p-6 text-center">
            <Mail className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No email accounts connected yet. Connect a Gmail or Outlook account to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Connected Accounts:</p>
            {connections.map((connection) => (
              <div
                key={connection.connectionId}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Account Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {connection.emailAddress}
                      </span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {getProviderLabel(connection.provider)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <StatusBadge status={connection.status} />
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last sync: {formatRelativeTime(connection.lastSyncAt)}
                      </span>
                    </div>
                    {/* Error display */}
                    {connection.lastError && (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span className="line-clamp-2">{connection.lastError}</span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex shrink-0 items-center gap-2">
                    {connection.status === 'active' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePause(connection.connectionId)}
                        disabled={actionLoading === connection.connectionId}
                      >
                        <Pause className="mr-1 h-3 w-3" />
                        Pause
                      </Button>
                    ) : connection.status === 'paused' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResume(connection.connectionId)}
                        disabled={actionLoading === connection.connectionId}
                      >
                        <Play className="mr-1 h-3 w-3" />
                        Resume
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => handleDisconnect(connection.connectionId, connection.emailAddress)}
                      disabled={actionLoading === connection.connectionId}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Disconnect
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default EmailConnectionPanel
