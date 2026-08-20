import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck,
  Star,
  Search,
  CheckCircle2,
  Trash2,
  Send,
  Download,
  RefreshCw,
  Bell,
  BellRing,
  User,
  X,
  Lock,
  Flame,
  Loader2,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  getAllFeedbacks,
  updateFeedbackStatus,
  addFeedbackReply,
  deleteFeedbackItem,
  markFeedbackAsRead,
} from '@/lib/feedback'
import {
  type UserFeedback,
  type FeedbackStatus,
  ADMIN_FEEDBACK_EMAIL,
  isFeedbackAdmin,
} from '@/lib/types'
import { classNames } from '@/lib/format'
import { StatusBadge } from '@/components/ui'

export default function AdminFeedbackPage() {
  const { user } = useAuth()
  const [feedbacks, setFeedbacks] = useState<UserFeedback[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [selectedFeedback, setSelectedFeedback] = useState<UserFeedback | null>(null)
  const [replyText, setReplyText] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [newPopupItem, setNewPopupItem] = useState<UserFeedback | null>(null)
  const [audioNotifications, setAudioNotifications] = useState(true)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const currentUserEmail = user?.email || ''
  const isAuthorized = isFeedbackAdmin(currentUserEmail)
  const previousCountRef = useRef<number>(0)

  const playNotificationSound = useCallback(() => {
    if (!audioNotifications) return
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime) // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15) // A5
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 0.35)
    } catch {
      // Audio context might be restricted before interaction
    }
  }, [audioNotifications])

  const loadData = useCallback(async (isInitial = false) => {
    try {
      const data = await getAllFeedbacks()
      setFeedbacks(data)

      // If new feedback appeared since last check, trigger pop-up
      if (!isInitial && data.length > previousCountRef.current && previousCountRef.current > 0) {
        const latest = data[0]
        setNewPopupItem(latest)
        playNotificationSound()
      }
      previousCountRef.current = data.length
    } catch (err) {
      console.error('Error fetching feedbacks for admin:', err)
    } finally {
      setLoading(false)
    }
  }, [playNotificationSound])

  useEffect(() => {
    if (!isAuthorized) return
    void loadData(true)

    // Listen for custom dispatch events when user submits feedback in another component
    const handleNewFeedbackEvent = (e: any) => {
      const fb = e.detail as UserFeedback
      if (fb) {
        setFeedbacks((prev) => [fb, ...prev.filter((item) => item.id !== fb.id)])
        setNewPopupItem(fb)
        playNotificationSound()
      }
    }

    window.addEventListener('clipforge:new-feedback', handleNewFeedbackEvent)
    const interval = setInterval(() => {
      void loadData(false)
    }, 4000)

    return () => {
      window.removeEventListener('clipforge:new-feedback', handleNewFeedbackEvent)
      clearInterval(interval)
    }
  }, [isAuthorized, loadData, playNotificationSound])

  // If unauthorized user visits this route
  if (!isAuthorized) {
    return (
      <div className="flex min-h-[550px] flex-col items-center justify-center p-6 text-center">
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-8 max-w-lg space-y-5 shadow-2xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-red-400 border border-red-500/40">
            <Lock className="h-8 w-8" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white tracking-tight">Access Restricted</h2>
            <p className="text-sm text-red-200/90 leading-relaxed">
              This is the protected Admin Feedback portal. Only the designated administrator account (<span className="font-mono font-bold text-white bg-red-950/80 px-2 py-0.5 rounded border border-red-500/30">{ADMIN_FEEDBACK_EMAIL}</span>) is permitted to access this area.
            </p>
          </div>

          <div className="rounded-lg bg-surface-900/90 p-4 border border-surface-700 text-xs text-left space-y-1.5">
            <div className="flex justify-between text-zinc-400">
              <span>Your Account:</span>
              <span className="font-semibold text-zinc-200">{currentUserEmail || 'Not Signed In'}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Required Role:</span>
              <span className="font-semibold text-red-400">Super Administrator</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link to="/feedback" className="btn-primary !px-5 !py-2 text-xs w-full sm:w-auto">
              Go to User Feedback Page
            </Link>
            <Link to="/" className="btn-secondary !px-5 !py-2 text-xs w-full sm:w-auto">
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Filtered list
  const filtered = feedbacks.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchesSearch =
        item.subject.toLowerCase().includes(q) ||
        item.message.toLowerCase().includes(q) ||
        item.user_email.toLowerCase().includes(q) ||
        (item.user_name && item.user_name.toLowerCase().includes(q))
      if (!matchesSearch) return false
    }
    return true
  })

  // Metrics
  const totalCount = feedbacks.length
  const pendingCount = feedbacks.filter((f) => f.status === 'pending').length
  const resolvedCount = feedbacks.filter((f) => f.status === 'resolved').length
  const avgRating = totalCount > 0
    ? (feedbacks.reduce((acc, curr) => acc + (curr.rating || 5), 0) / totalCount).toFixed(1)
    : '5.0'

  const handleSelectFeedback = (item: UserFeedback) => {
    setSelectedFeedback(item)
    setReplyText(item.admin_reply || '')
    setInternalNote(item.admin_notes || '')
    if (!item.is_read) {
      void markFeedbackAsRead(item.id)
      setFeedbacks((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, is_read: true } : f)),
      )
    }
  }

  const handleUpdateStatus = async (status: FeedbackStatus) => {
    if (!selectedFeedback) return
    setActionBusy(true)
    try {
      await updateFeedbackStatus(selectedFeedback.id, status, internalNote)
      setFeedbacks((prev) =>
        prev.map((f) =>
          f.id === selectedFeedback.id
            ? { ...f, status, admin_notes: internalNote, updated_at: new Date().toISOString() }
            : f,
        ),
      )
      setSelectedFeedback((prev) =>
        prev ? { ...prev, status, admin_notes: internalNote } : null,
      )
      setToastMessage(`Feedback status marked as "${status}"`)
      setTimeout(() => setToastMessage(null), 2500)
    } finally {
      setActionBusy(false)
    }
  }

  const handleSaveReply = async () => {
    if (!selectedFeedback || !replyText.trim()) return
    setActionBusy(true)
    try {
      await addFeedbackReply(selectedFeedback.id, replyText.trim())
      setFeedbacks((prev) =>
        prev.map((f) =>
          f.id === selectedFeedback.id
            ? { ...f, admin_reply: replyText.trim(), status: f.status === 'pending' ? 'in_review' : f.status }
            : f,
        ),
      )
      setSelectedFeedback((prev) =>
        prev ? { ...prev, admin_reply: replyText.trim(), status: prev.status === 'pending' ? 'in_review' : prev.status } : null,
      )
      setToastMessage('Reply sent to creator!')
      setTimeout(() => setToastMessage(null), 2500)
    } finally {
      setActionBusy(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this feedback?')) return
    await deleteFeedbackItem(id)
    setFeedbacks((prev) => prev.filter((f) => f.id !== id))
    if (selectedFeedback?.id === id) {
      setSelectedFeedback(null)
    }
    setToastMessage('Feedback deleted')
    setTimeout(() => setToastMessage(null), 2000)
  }

  const exportCSV = () => {
    const headers = ['ID', 'Date', 'User Email', 'User Name', 'Category', 'Rating', 'Subject', 'Message', 'Status', 'Admin Reply']
    const rows = feedbacks.map((f) => [
      f.id,
      new Date(f.created_at).toISOString(),
      `"${f.user_email}"`,
      `"${f.user_name || ''}"`,
      f.category,
      f.rating,
      `"${f.subject.replace(/"/g, '""')}"`,
      `"${f.message.replace(/"/g, '""')}"`,
      f.status,
      `"${(f.admin_reply || '').replace(/"/g, '""')}"`,
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `clipforge-feedbacks-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-surface-800 border border-brand-500/40 text-white px-4 py-2.5 text-xs shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          {toastMessage}
        </div>
      )}

      {/* Real-time Pop-up Modal when new feedback arrives */}
      {newPopupItem && (
        <div className="fixed top-6 right-6 z-50 max-w-md w-full animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="rounded-xl border-2 border-brand-500 bg-surface-900 p-4 shadow-2xl shadow-brand-500/20 text-white space-y-3 relative overflow-hidden">
            <div className="absolute -right-8 -top-8 h-24 w-24 bg-brand-500/10 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-500" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-brand-400 flex items-center gap-1.5">
                  <Flame className="h-3.5 w-3.5 text-amber-400" /> Live Feedback Incoming!
                </span>
              </div>
              <button
                onClick={() => setNewPopupItem(null)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white line-clamp-1">
                {newPopupItem.subject}
              </h4>
              <p className="text-xs text-zinc-300 line-clamp-2">
                {newPopupItem.message}
              </p>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-surface-800 text-[11px] text-zinc-400">
              <span className="truncate max-w-[180px]">{newPopupItem.user_email}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    handleSelectFeedback(newPopupItem)
                    setNewPopupItem(null)
                  }}
                  className="btn-primary !px-3 !py-1 text-xs !bg-brand-500 hover:!bg-brand-400 !text-white"
                >
                  View & Reply →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header & Superadmin badge */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-white tracking-tight">Admin Feedback Hub</h1>
            <span className="rounded-md bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-300 border border-amber-500/30 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-amber-400" /> Super Admin
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Live incoming feedbacks, bug reports, and rating scores submitted by creators.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAudioNotifications(!audioNotifications)}
            className={classNames(
              'btn-secondary !px-3 !py-2 text-xs flex items-center gap-1.5',
              audioNotifications ? 'text-brand-400 border-brand-500/30' : 'text-zinc-500',
            )}
            title={audioNotifications ? 'Audio chime active' : 'Audio muted'}
          >
            {audioNotifications ? <BellRing className="h-3.5 w-3.5 text-brand-400" /> : <Bell className="h-3.5 w-3.5" />}
            <span>{audioNotifications ? 'Chime ON' : 'Chime Muted'}</span>
          </button>

          <button
            onClick={() => void loadData(false)}
            className="btn-secondary !px-3 !py-2 text-xs flex items-center gap-1.5"
            title="Refresh feeds"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>

          <button
            onClick={exportCSV}
            className="btn-secondary !px-3 !py-2 text-xs flex items-center gap-1.5"
            title="Download CSV"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 space-y-1">
          <span className="text-xs font-medium text-zinc-400">Total Feedbacks</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{totalCount}</span>
            <span className="text-xs text-zinc-500">all time</span>
          </div>
        </div>

        <div className="card p-4 space-y-1">
          <span className="text-xs font-medium text-zinc-400">Action Required</span>
          <div className="flex items-baseline gap-2">
            <span className={classNames('text-2xl font-bold', pendingCount > 0 ? 'text-amber-400' : 'text-emerald-400')}>
              {pendingCount}
            </span>
            <span className="text-xs text-amber-500/80">pending reviews</span>
          </div>
        </div>

        <div className="card p-4 space-y-1">
          <span className="text-xs font-medium text-zinc-400">Satisfaction Score</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-300 flex items-center gap-1">
              {avgRating} <Star className="h-4 w-4 fill-amber-400 text-amber-400 inline" />
            </span>
            <span className="text-xs text-zinc-500">avg</span>
          </div>
        </div>

        <div className="card p-4 space-y-1">
          <span className="text-xs font-medium text-zinc-400">Resolved Issues</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400">{resolvedCount}</span>
            <span className="text-xs text-emerald-500/80">closed</span>
          </div>
        </div>
      </div>

      {/* Main Layout: List on Left, Detail / Action Drawer on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Feedback List Column */}
        <div className={classNames('space-y-4', selectedFeedback ? 'lg:col-span-6' : 'lg:col-span-12')}>
          {/* Filter Bar */}
          <div className="card p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search by subject, message, or user email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input w-full !pl-9 text-xs"
                />
              </div>

              <div className="flex gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="input text-xs"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="in_review">In Review</option>
                  <option value="resolved">Resolved</option>
                  <option value="planned">Planned</option>
                  <option value="archived">Archived</option>
                </select>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="input text-xs"
                >
                  <option value="all">All Categories</option>
                  <option value="feature">Feature Requests</option>
                  <option value="bug">Bug Reports</option>
                  <option value="captions">Captions & Whisper</option>
                  <option value="video_quality">Video & Audio</option>
                  <option value="ui_ux">UI & Usability</option>
                  <option value="performance">Performance</option>
                  <option value="general">General</option>
                </select>
              </div>
            </div>
          </div>

          {/* List Items */}
          <div className="space-y-2.5">
            {loading ? (
              <div className="card p-12 text-center flex flex-col items-center justify-center space-y-2 text-zinc-400 text-xs">
                <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
                <p className="text-zinc-300">Loading incoming feedback...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="card p-10 text-center space-y-2 text-zinc-400 text-xs">
                <p className="font-semibold text-zinc-300">No feedbacks match your filters</p>
                <p>Try adjusting your search criteria or status filters above.</p>
              </div>
            ) : (
              filtered.map((item) => {
                const isSelected = selectedFeedback?.id === item.id
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectFeedback(item)}
                    className={classNames(
                      'card p-4 cursor-pointer transition-all border text-left space-y-2.5 relative hover:border-surface-600',
                      isSelected
                        ? 'border-brand-500 bg-brand-500/5 shadow-md shadow-brand-500/5'
                        : item.status === 'pending'
                          ? 'border-amber-500/30 bg-surface-850'
                          : 'border-surface-700 bg-surface-900',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {item.status === 'pending' && (
                          <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" title="Unread / Pending" />
                        )}
                        <h4 className="text-sm font-semibold text-white truncate">
                          {item.subject}
                        </h4>
                        <span className="rounded bg-surface-800 px-2 py-0.5 text-[10px] text-zinc-300 font-medium capitalize">
                          {item.category.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center text-amber-400">
                          {Array.from({ length: item.rating || 5 }).map((_, i) => (
                            <Star key={i} className="h-3 w-3 fill-amber-400" />
                          ))}
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                    </div>

                    <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed">
                      {item.message}
                    </p>

                    <div className="flex items-center justify-between pt-1 border-t border-surface-800 text-[11px] text-zinc-400">
                      <div className="flex items-center gap-1.5 truncate">
                        <User className="h-3 w-3 text-zinc-500 shrink-0" />
                        <span className="truncate text-zinc-300 font-medium">
                          {item.user_name || item.user_email}
                        </span>
                        <span className="text-zinc-500">({item.user_email})</span>
                      </div>
                      <span className="font-mono text-zinc-500 shrink-0">
                        {new Date(item.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Feedback Detail / Moderation Inspector Column */}
        {selectedFeedback && (
          <div className="lg:col-span-6 space-y-4">
            <div className="card p-5 space-y-5 border-surface-600 sticky top-6">
              {/* Top Header */}
              <div className="flex items-start justify-between gap-3 border-b border-surface-700 pb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded bg-brand-500/20 text-brand-400 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider border border-brand-500/30">
                      {selectedFeedback.category.replace('_', ' ')}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-500">#{selectedFeedback.id}</span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">
                    {selectedFeedback.subject}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedFeedback(null)}
                  className="text-zinc-400 hover:text-zinc-200 p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Creator Info Box */}
              <div className="rounded-lg bg-surface-850 p-3 border border-surface-700 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-zinc-300">
                  <span className="text-zinc-400">User Email:</span>
                  <span className="font-semibold text-white">{selectedFeedback.user_email}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-300">
                  <span className="text-zinc-400">User Rating:</span>
                  <div className="flex items-center text-amber-400 gap-1">
                    {Array.from({ length: selectedFeedback.rating || 5 }).map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-amber-400" />
                    ))}
                    <span className="font-bold ml-1 text-zinc-200">{selectedFeedback.rating}/5</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-zinc-300">
                  <span className="text-zinc-400">Submitted Time:</span>
                  <span className="font-mono text-zinc-400">
                    {new Date(selectedFeedback.created_at).toLocaleString()}
                  </span>
                </div>
                {selectedFeedback.device_info && (
                  <div className="flex items-center justify-between text-zinc-300">
                    <span className="text-zinc-400">Client / Browser:</span>
                    <span className="text-[11px] text-zinc-400 truncate max-w-[200px]" title={selectedFeedback.device_info}>
                      {selectedFeedback.device_info}
                    </span>
                  </div>
                )}
              </div>

              {/* Message Details */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-400">Feedback Description</label>
                <div className="rounded-lg bg-surface-900 p-3.5 text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap border border-surface-800">
                  {selectedFeedback.message}
                </div>
              </div>

              {/* Quick Status Toggles */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-400">Update Status</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {(['pending', 'in_review', 'planned', 'resolved', 'archived'] as FeedbackStatus[]).map((st) => (
                    <button
                      key={st}
                      disabled={actionBusy}
                      onClick={() => void handleUpdateStatus(st)}
                      className={classNames(
                        'px-2 py-1.5 text-[11px] font-semibold rounded-lg capitalize border transition-all text-center',
                        selectedFeedback.status === st
                          ? 'bg-brand-500 text-white border-brand-400 shadow-sm'
                          : 'bg-surface-800 text-zinc-400 border-surface-700 hover:text-zinc-200 hover:bg-surface-700',
                      )}
                    >
                      {st.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Admin Direct Reply */}
              <div className="space-y-2 border-t border-surface-700 pt-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Send className="h-3.5 w-3.5 text-brand-400" /> Reply to Creator
                  </label>
                  <span className="text-[10px] text-zinc-500">Will be shown in user's history</span>
                </div>
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="e.g. Thanks for the report! We have deployed a fix in today's patch..."
                  className="input w-full text-xs leading-relaxed"
                />
                <button
                  disabled={actionBusy || !replyText.trim()}
                  onClick={() => void handleSaveReply()}
                  className="btn-primary !px-4 !py-1.5 text-xs w-full justify-center flex items-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  {actionBusy ? 'Saving...' : 'Send / Update Reply'}
                </button>
              </div>

              {/* Internal Admin Notes */}
              <div className="space-y-1.5 border-t border-surface-700 pt-3">
                <label className="text-xs font-semibold text-zinc-400">Internal Admin Notes</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    placeholder="Internal team note (e.g. Assigned to Remotion engine sprint)"
                    className="input flex-1 text-xs"
                  />
                  <button
                    disabled={actionBusy}
                    onClick={() => void handleUpdateStatus(selectedFeedback.status)}
                    className="btn-secondary !px-3 !py-1 text-xs"
                  >
                    Save Note
                  </button>
                </div>
              </div>

              {/* Danger Zone: Delete */}
              <div className="flex items-center justify-between border-t border-surface-700 pt-3 text-xs">
                <span className="text-zinc-500">Need to remove?</span>
                <button
                  onClick={() => void handleDelete(selectedFeedback.id)}
                  className="text-red-400 hover:text-red-300 flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete Feedback
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
