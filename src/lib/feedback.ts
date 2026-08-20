import { supabase } from '@/lib/supabase'
import type { UserFeedback, FeedbackCategory, FeedbackStatus } from '@/lib/types'

const FEEDBACK_STORAGE_KEY = 'clipforge_user_feedbacks_v1'

const INITIAL_DEMO_FEEDBACKS: UserFeedback[] = [
  {
    id: 'fb-demo-1',
    user_email: 'sarah.creator@media.io',
    user_name: 'Sarah Connor',
    category: 'feature',
    rating: 5,
    subject: 'Love the Remotion Studio & Karaoke Captions!',
    message:
      'The viral hook detector cut our editing time down from 3 hours to 10 minutes. Would love to have custom font upload support in the next update!',
    status: 'in_review',
    admin_reply: 'Thanks Sarah! Custom font upload (.woff2) is planned for the v2.5 release.',
    created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    is_read: true,
  },
  {
    id: 'fb-demo-2',
    user_email: 'alex.podcaster@soundwave.fm',
    user_name: 'Alex Rivera',
    category: 'video_quality',
    rating: 4,
    subject: 'Auto B-Roll scene timing suggestion',
    message:
      'The AI B-Roll matching is super accurate. It would be awesome if we could choose 2-second vs 4-second transition lengths in the editor.',
    status: 'planned',
    admin_notes: 'Add transition duration slider to Remotion B-Roll timeline',
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    is_read: true,
  },
  {
    id: 'fb-demo-3',
    user_email: 'kevin.shorts@ytgrowth.com',
    user_name: 'Kevin Vance',
    category: 'bug',
    rating: 5,
    subject: 'TikTok export ratio is crisp',
    message:
      'Everything rendered at high bitrate 1080x1920 with zero stutter. Keep up the amazing work team!',
    status: 'resolved',
    admin_reply: 'Glad to hear Kevin! We just optimized the GPU rendering pipeline.',
    created_at: new Date(Date.now() - 1000 * 60 * 340).toISOString(),
    is_read: true,
  },
]

function getLocalFeedbacks(): UserFeedback[] {
  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_FEEDBACKS))
      return INITIAL_DEMO_FEEDBACKS
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : INITIAL_DEMO_FEEDBACKS
  } catch {
    return INITIAL_DEMO_FEEDBACKS
  }
}

function saveLocalFeedbacks(feedbacks: UserFeedback[]) {
  try {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(feedbacks))
  } catch (err) {
    console.error('Error saving feedbacks to localStorage:', err)
  }
}

export async function submitUserFeedback(params: {
  userId?: string
  userEmail: string
  userName?: string
  category: FeedbackCategory
  rating: number
  subject: string
  message: string
  deviceInfo?: string
}): Promise<UserFeedback> {
  const newFeedback: UserFeedback = {
    id: `fb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    user_id: params.userId,
    user_email: params.userEmail.trim(),
    user_name: params.userName?.trim() || params.userEmail.split('@')[0],
    category: params.category,
    rating: params.rating,
    subject: params.subject.trim(),
    message: params.message.trim(),
    device_info: params.deviceInfo || (typeof navigator !== 'undefined' ? `${navigator.userAgent.slice(0, 100)}` : 'Web Browser'),
    status: 'pending',
    created_at: new Date().toISOString(),
    is_read: false,
  }

  // 1. Save to local cache
  const localList = getLocalFeedbacks()
  const updatedList = [newFeedback, ...localList]
  saveLocalFeedbacks(updatedList)

  // 2. Try saving to Supabase if table exists
  try {
    const { data, error } = await supabase.from('user_feedbacks').insert({
      id: newFeedback.id,
      user_id: newFeedback.user_id,
      user_email: newFeedback.user_email,
      user_name: newFeedback.user_name,
      category: newFeedback.category,
      rating: newFeedback.rating,
      subject: newFeedback.subject,
      message: newFeedback.message,
      device_info: newFeedback.device_info,
      status: newFeedback.status,
      created_at: newFeedback.created_at,
    }).select().maybeSingle()

    if (!error && data) {
      // successfully stored in Supabase
    }
  } catch (err) {
    // Non-blocking fallback to local storage
    console.warn('Supabase user_feedbacks insert fallback:', err)
  }

  // 3. Dispatch window custom event so any open Admin tabs / components receive it instantly
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('clipforge:new-feedback', {
          detail: newFeedback,
        }),
      )
    }
  } catch {}

  return newFeedback
}

export async function getAllFeedbacks(): Promise<UserFeedback[]> {
  let list = getLocalFeedbacks()

  try {
    const { data, error } = await supabase
      .from('user_feedbacks')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && Array.isArray(data) && data.length > 0) {
      // Merge unique items
      const ids = new Set(data.map((d: any) => d.id))
      const extraLocal = list.filter((l) => !ids.has(l.id))
      list = [...data, ...extraLocal]
      saveLocalFeedbacks(list)
    }
  } catch (err) {
    console.warn('Supabase feedbacks load fallback:', err)
  }

  return list
}

export async function getUserFeedbacks(userEmail: string): Promise<UserFeedback[]> {
  const all = await getAllFeedbacks()
  const cleanEmail = userEmail.trim().toLowerCase()
  return all.filter((f) => f.user_email.toLowerCase() === cleanEmail)
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: FeedbackStatus,
  adminNotes?: string,
): Promise<void> {
  const list = getLocalFeedbacks()
  const updated = list.map((item) => {
    if (item.id === feedbackId) {
      return {
        ...item,
        status,
        ...(adminNotes !== undefined ? { admin_notes: adminNotes } : {}),
        updated_at: new Date().toISOString(),
      }
    }
    return item
  })
  saveLocalFeedbacks(updated)

  try {
    await supabase
      .from('user_feedbacks')
      .update({
        status,
        ...(adminNotes !== undefined ? { admin_notes: adminNotes } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', feedbackId)
  } catch (err) {
    console.warn('Supabase update fallback:', err)
  }
}

export async function addFeedbackReply(
  feedbackId: string,
  adminReply: string,
): Promise<void> {
  const list = getLocalFeedbacks()
  const updated = list.map((item) => {
    if (item.id === feedbackId) {
      return {
        ...item,
        admin_reply: adminReply,
        updated_at: new Date().toISOString(),
      }
    }
    return item
  })
  saveLocalFeedbacks(updated)

  try {
    await supabase
      .from('user_feedbacks')
      .update({
        admin_reply: adminReply,
        updated_at: new Date().toISOString(),
      })
      .eq('id', feedbackId)
  } catch (err) {
    console.warn('Supabase reply update fallback:', err)
  }
}

export async function deleteFeedbackItem(feedbackId: string): Promise<void> {
  const list = getLocalFeedbacks()
  const updated = list.filter((item) => item.id !== feedbackId)
  saveLocalFeedbacks(updated)

  try {
    await supabase.from('user_feedbacks').delete().eq('id', feedbackId)
  } catch (err) {
    console.warn('Supabase delete feedback fallback:', err)
  }
}

export async function markFeedbackAsRead(feedbackId: string): Promise<void> {
  const list = getLocalFeedbacks()
  const updated = list.map((item) =>
    item.id === feedbackId ? { ...item, is_read: true } : item,
  )
  saveLocalFeedbacks(updated)
}
