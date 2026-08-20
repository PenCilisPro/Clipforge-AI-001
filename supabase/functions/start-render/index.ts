// Validates a render job and optionally notifies the render worker webhook.
// The Node render worker polls for QUEUED jobs, so this function is a
// fast-path trigger rather than the renderer itself (Remotion cannot run
// inside an edge function).

import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireUser,
  serviceClient,
} from '../_shared/utils.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    await requireUser(req)
  } catch {
    return errorResponse('Unauthorized', 401)
  }

  const { renderJobId } = (await req.json().catch(() => ({}))) as { renderJobId?: string }
  if (!renderJobId) return errorResponse('Missing "renderJobId".')

  const supabase = serviceClient()
  const { data: job, error } = await supabase
    .from('render_jobs')
    .select('id, status')
    .eq('id', renderJobId)
    .single()
  if (error || !job) return errorResponse('Render job not found.', 404)

  const webhookUrl = Deno.env.get('RENDER_WORKER_WEBHOOK_URL')
  if (webhookUrl) {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ renderJobId }),
    }).catch(() => {
      // Worker polling remains the fallback.
    })
  }

  return jsonResponse({ accepted: true, status: job.status })
})
