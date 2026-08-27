import { queueReadyProjects } from './autoQueueProjects'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  console.log('[Remotion] Automatic project queue agent active.')
  for (;;) {
    try {
      const created = await queueReadyProjects()
      if (created > 0) console.log(`[Remotion] Automatically queued ${created} project clip render job(s).`)
    } catch (error) {
      console.error('[Remotion] Automatic project queue error:', error instanceof Error ? error.message : String(error))
    }
    await sleep(2000)
  }
}

void main()
