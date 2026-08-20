import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  MessageSquareHeart,
  Star,
  Send,
  Sparkles,
  Bug,
  Lightbulb,
  Video,
  Type,
  Layout as LayoutIcon,
  Zap,
  MessageCircle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ArrowRight,
  User,
  AlertCircle,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  submitUserFeedback,
  getUserFeedbacks,
} from '@/lib/feedback'
import {
  type FeedbackCategory,
  type UserFeedback,
  isFeedbackAdmin,
} from '@/lib/types'
import { classNames } from '@/lib/format'
import { PageHeader, StatusBadge } from '@/components/ui'

const CATEGORIES: Array<{
  id: FeedbackCategory
  label: string
  icon: typeof Bug
  desc: string
  color: string
}> = [
  {
    id: 'feature',
    label: 'Feature Request',
    icon: Lightbulb,
    desc: 'Suggest tools, integrations, or workflows',
    color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  },
  {
    id: 'bug',
    label: 'Bug Report',
    icon: Bug,
    desc: 'Report unexpected behavior or glitches',
    color: 'text-red-400 border-red-500/30 bg-red-500/10',
  },
  {
    id: 'captions',
    label: 'Captions & Whisper',
    icon: Type,
    desc: 'Feedback on subtitle timing & styling',
    color: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  },
  {
    id: 'video_quality',
    label: 'Video & Audio',
    icon: Video,
    desc: 'Remotion rendering & B-Roll sync',
    color: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  },
  {
    id: 'ui_ux',
    label: 'UI & Usability',
    icon: LayoutIcon,
    desc: 'Editor layout, ergonomics, and themes',
    color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  },
  {
    id: 'performance',
    label: 'Performance & Speed',
    icon: Zap,
    desc: 'App speed, export time, or responsiveness',
    color: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  },
  {
    id: 'general',
    label: 'General Feedback',
    icon: MessageCircle,
    desc: 'Thoughts, praise, or general suggestions',
    color: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
  },
]

export default function FeedbackPage() {
  const { user } = useAuth()
  const [category, setCategory] = useState<FeedbackCategory>('feature')
  const [rating, setRating] = useState<number>(5)
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submittedFeedback, setSubmittedFeedback] = useState<UserFeedback | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [userHistory, setUserHistory] = useState<UserFeedback[]>([])
  const [activeTab, setActiveTab] = useState<'submit' | 'history'>('submit')

  const userEmail = user?.email || 'creator@clipforge.ai'
  const isAdmin = isFeedbackAdmin(user?.email)

  useEffect(() => {
    if (userEmail) {
      void getUserFeedbacks(userEmail).then(setUserHistory)
    }
  }, [userEmail])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !message.trim()) {
      setErrorMessage('Please provide both a subject line and feedback details.')
      return
    }

    setSubmitting(true)
    setErrorMessage(null)

    try {
      const created = await submitUserFeedback({
        userId: user?.id,
        userEmail,
        userName: user?.user_metadata?.full_name || userEmail.split('@')[0],
        category,
        rating,
        subject,
        message,
      })

      setSubmittedFeedback(created)
      setUserHistory((prev) => [created, ...prev])
      setSubject('')
      setMessage('')
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to submit feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Share Your Feedback"
        subtitle="Help shape the future of ClipForge AI. Your ideas and bug reports go straight to our engineering team."
      />

      {/* Admin Notice Banner if logged in user is PenCilMaCro@gmail.com */}
      {isAdmin && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-amber-500/5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/20 p-2.5 text-amber-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">Administrator Access Active</span>
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">
                  {userEmail}
                </span>
              </div>
              <p className="text-xs text-amber-200/80">
                You have exclusive administrative rights to view and moderate live incoming user feedback.
              </p>
            </div>
          </div>
          <Link
            to="/admin/feedback"
            className="btn-primary !bg-amber-500 hover:!bg-amber-400 !text-black !font-semibold text-xs flex items-center gap-1.5 shrink-0"
          >
            Open Admin Inbox <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* Navigation tabs between submit and previous feedback */}
      <div className="flex items-center gap-3 border-b border-surface-700 pb-2">
        <button
          onClick={() => setActiveTab('submit')}
          className={classNames(
            'flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors',
            activeTab === 'submit'
              ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface-800',
          )}
        >
          <MessageSquareHeart className="h-4 w-4" />
          Submit Feedback
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={classNames(
            'flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors',
            activeTab === 'history'
              ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface-800',
          )}
        >
          <Clock className="h-4 w-4" />
          My Feedback History ({userHistory.length})
        </button>
      </div>

      {activeTab === 'submit' ? (
        <div className="space-y-6">
          {submittedFeedback && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 space-y-3 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold text-white">Thank You for Your Feedback!</h3>
                  <p className="text-xs text-emerald-200/90">
                    Your submission <span className="font-mono text-emerald-300">#{submittedFeedback.id}</span> has been received and routed to our team inbox.
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-surface-900/80 p-3 text-xs border border-emerald-500/20 text-zinc-300">
                <p className="font-semibold text-zinc-200">"{submittedFeedback.subject}"</p>
                <p className="mt-1 text-zinc-400 line-clamp-2">{submittedFeedback.message}</p>
              </div>
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => setSubmittedFeedback(null)}
                  className="btn-secondary !px-3 !py-1 text-xs"
                >
                  Submit Another Feedback
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className="text-xs text-brand-400 hover:text-brand-300 font-medium"
                >
                  View in My History →
                </button>
              </div>
            </div>
          )}

          {!submittedFeedback && (
            <form onSubmit={handleSubmit} className="card p-6 space-y-6">
              {errorMessage && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {errorMessage}
                </div>
              )}

              {/* 1. Overall Satisfaction Rating */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
                  <span>How would you rate your ClipForge experience?</span>
                  <span className="text-zinc-500 font-normal">
                    {hoverRating || rating}/5 {rating === 5 ? '🔥 Fantastic' : rating >= 4 ? '✨ Great' : rating === 3 ? '👌 Okay' : '🔧 Needs Improvement'}
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const active = (hoverRating ?? rating) >= star
                    return (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(null)}
                        className="p-1 rounded hover:scale-110 transition-transform focus:outline-none"
                      >
                        <Star
                          className={classNames(
                            'h-7 w-7 transition-colors',
                            active
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-zinc-600 hover:text-zinc-400',
                          )}
                        />
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 2. Feedback Category Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300">
                  Select Feedback Category
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {CATEGORIES.map((cat) => {
                    const isSelected = category === cat.id
                    const Icon = cat.icon
                    return (
                      <button
                        type="button"
                        key={cat.id}
                        onClick={() => setCategory(cat.id)}
                        className={classNames(
                          'flex items-start gap-3 p-3 rounded-xl text-left border transition-all',
                          isSelected
                            ? 'border-brand-500 bg-brand-500/10 shadow-sm'
                            : 'border-surface-700 bg-surface-850 hover:border-surface-600 hover:bg-surface-800',
                        )}
                      >
                        <div
                          className={classNames(
                            'rounded-lg p-2 shrink-0 border',
                            isSelected
                              ? 'bg-brand-500/20 text-brand-400 border-brand-500/30'
                              : cat.color,
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-zinc-200">{cat.label}</p>
                          <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">
                            {cat.desc}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 3. Subject Line */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">
                  Subject / Summary
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Add 1:1 square video ratio option for Instagram feed posts"
                  className="input w-full text-sm"
                  maxLength={120}
                />
              </div>

              {/* 4. Detailed Message */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300">
                    Details & What You Experienced
                  </label>
                  <span className="text-[11px] text-zinc-500">{message.length} characters</span>
                </div>
                <textarea
                  required
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Please describe what feature you'd like to see or what issue occurred, including any steps to reproduce..."
                  className="input w-full text-sm resize-y leading-relaxed font-sans"
                />
              </div>

              {/* 5. User Email info & submit button */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-surface-700">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <User className="h-3.5 w-3.5 text-zinc-500" />
                  <span>
                    Submitting as <span className="font-semibold text-zinc-200">{userEmail}</span>
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={submitting || !subject.trim() || !message.trim()}
                  className="btn-primary !px-5 !py-2.5 text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <Send className="h-3.5 w-3.5" />
                  {submitting ? 'Sending Feedback...' : 'Send Feedback to Team'}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        /* History Tab */
        <div className="space-y-4">
          {userHistory.length === 0 ? (
            <div className="card p-12 text-center space-y-3">
              <div className="mx-auto rounded-full bg-surface-800 p-3.5 w-fit text-zinc-500">
                <MessageSquareHeart className="h-8 w-8 text-zinc-400" />
              </div>
              <h3 className="text-base font-semibold text-white">No Submitted Feedback Yet</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                Any bug reports, feature suggestions, or praise you submit will show up here along with updates from our development team.
              </p>
              <button
                onClick={() => setActiveTab('submit')}
                className="btn-primary !px-4 !py-2 text-xs mx-auto"
              >
                Write Your First Feedback
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {userHistory.map((item) => (
                <div key={item.id} className="card p-4 space-y-3 border-surface-700">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-surface-800 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-white">{item.subject}</span>
                      <span className="rounded-full bg-surface-800 px-2 py-0.5 text-[10px] text-zinc-300 font-medium capitalize">
                        {item.category.replace('_', ' ')}
                      </span>
                      <div className="flex items-center text-amber-400">
                        {Array.from({ length: item.rating }).map((_, i) => (
                          <Star key={i} className="h-3 w-3 fill-amber-400" />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={item.status} />
                      <span className="text-[11px] text-zinc-500 font-mono">
                        {new Date(item.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {item.message}
                  </p>

                  {/* Admin Reply if present */}
                  {item.admin_reply && (
                    <div className="rounded-lg bg-brand-500/10 border border-brand-500/30 p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-300">
                        <Sparkles className="h-3.5 w-3.5 text-brand-400" /> Response from ClipForge Team:
                      </div>
                      <p className="text-xs text-zinc-200 pl-5 leading-relaxed">
                        {item.admin_reply}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
