import { supabase } from './supabase'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Watches a newly-created project until clip versions exist, then queues every
 * clip version exactly once for the background Remotion renderer.
 * The project remains non-completed until the renderer reports completion.
 */
export async function autoQueueProjectRenders(projectId: string): Promise<void> {
  const deadline = Date.now() + 10 * 60 * 1000

  while (Date.now() < deadline) {
    const { data: clips, error: clipsError } = await supabase
      .from('clips')
      .select('id,status')
      .eq('project_id', projectId)

    if (clipsError) {
      await sleep(2000)
      continue
    }

    if (clips && clips.length > 0) {
      const clipIds = clips.map((clip) => clip.id)
      const { data: versions } = await supabase
        .from('clip_versions')
        .select('id,clip_id')
        .in('clip_id', clipIds)
        .order('version_number', { ascending: true })

      const versionRows = versions ?? []
      let queued = 0

      for (const version of versionRows) {
        const { data: existing } = await supabase
          .from('render_jobs')
          .select('id,status')
          .eq('clip_version_id', version.id)
          .in('status', ['QUEUED', 'PREPARING', 'RENDERING', 'UPLOADING', 'COMPLETED'])
          .limit(1)
          .maybeSingle()

        if (existing) continue

        const { error: insertError } = await supabase.from('render_jobs').insert({
          clip_id: version.clip_id,
          clip_version_id: version.id,
          status: 'QUEUED',
          progress: 0,
          stage: 'QUEUED_FOR_REMOTION',
          error_message: null,
        })

        if (!insertError) queued += 1
      }

      if (queued > 0 || versionRows.length > 0) {
        await supabase.from('projects').update({
          status: versionRows.length > 0 ? 'RENDERING' : 'FINDING_CLIPS',
          progress: versionRows.length > 0 ? 90 : 85,
          error_message: null,
          updated_at: new Date().toISOString(),
        }).eq('id', projectId)
      }

      // Do not wait for the renders. The worker owns progress after the queue is created.
      return
    }

    await sleep(2000)
  }

  await supabase.from('projects').update({
    status: 'FAILED',
    progress: 0,
    error_message: 'Clip generation timed out before render jobs could be queued.',
    updated_at: new Date().toISOString(),
  }).eq('id', projectId)
}
