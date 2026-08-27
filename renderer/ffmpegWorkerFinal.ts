import 'dotenv/config'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import type { ClipConfiguration, BrollConfigItem } from './src/types'

const exec = promisify(execFile)
const required = (name: string) => { const v = process.env[name]?.trim(); if (!v) throw new Error(`Missing required environment variable: ${name}`); return v }
const optional = (name: string, fallback: string) => process.env[name]?.trim() || fallback
const SUPABASE_URL = required('SUPABASE_URL')
const SERVICE_KEY = required('SUPABASE_SERVICE_ROLE_KEY')
const FFMPEG = optional('FFMPEG_PATH', 'ffmpeg')
const FFPROBE = optional('FFPROBE_PATH', 'ffprobe')
const YTDLP = optional('YTDLP_PATH', 'yt-dlp')
const RAPID_KEY = process.env.RAPIDAPI_KEY?.trim() || process.env.VITE_RAPIDAPI_KEY?.trim()
const RAPID_HOST = optional('RAPIDAPI_HOST', 'youtube-media-downloader.p.rapidapi.com')
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

type Job = { id: string; clip_id: string; clip_version_id: string }
type Broll = BrollConfigItem & { file: string }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const num = (v: unknown, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d
const text = (v: string) => v.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/%/g, '\\%').replace(/\n/g, ' ')

async function updateJob(id: string, fields: Record<string, unknown>) { const { error } = await supabase.from('render_jobs').update(fields).eq('id', id); if (error) console.error(`[FFmpeg] ${error.message}`) }
async function download(url: string, file: string) { const r = await fetch(url, { redirect: 'follow' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); const b = Buffer.from(await r.arrayBuffer()); if (!b.length) throw new Error('empty media'); await writeFile(file, b) }
async function signed(pathName: string) { const { data, error } = await supabase.storage.from('sources').createSignedUrl(pathName, 21600); if (error || !data?.signedUrl) throw new Error(error?.message || 'cannot sign source'); return data.signedUrl }

async function sourceFor(config: ClipConfiguration, projectId: string, sourceType: string, sourceUrl: string | null, work: string) {
  const out = path.join(work, 'source.mp4')
  const configured = typeof config.sourceVideo === 'string' ? config.sourceVideo.trim() : ''
  if (configured.startsWith('projects/')) { await download(await signed(configured), out); return out }
  if (/^https?:\/\//i.test(configured)) { await download(configured, out); return out }
  const { data: video } = await supabase.from('videos').select('storage_path').eq('project_id', projectId).maybeSingle()
  const storage = typeof video?.storage_path === 'string' ? video.storage_path.trim() : ''
  if (storage.startsWith('projects/')) { await download(await signed(storage), out); return out }
  if (sourceType !== 'youtube' || !sourceUrl) throw new Error('No usable source video found')
  let downloaded = false
  if (RAPID_KEY) {
    try {
      const r = await fetch(`https://${RAPID_HOST}/v2/video/download?url=${encodeURIComponent(sourceUrl)}`, { headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST } })
      if (r.ok) {
        const ct = r.headers.get('content-type') || ''
        if (!ct.includes('json')) { await writeFile(out, Buffer.from(await r.arrayBuffer())); downloaded = true }
        else {
          const d: any = await r.json()
          const u = [d?.downloadUrl,d?.download_url,d?.url,d?.link,d?.data?.downloadUrl,d?.data?.download_url,d?.data?.url,...(Array.isArray(d?.data) ? d.data.map((x: any) => x?.url || x?.downloadUrl) : [])].find((x: unknown) => typeof x === 'string' && x.length)
          if (u) { await download(String(u), out); downloaded = true }
        }
      }
    } catch (e) { console.warn(`[FFmpeg] RapidAPI fallback: ${e instanceof Error ? e.message : String(e)}`) }
  }
  if (!downloaded) {
    const template = `${out}.%(ext)s`
    await exec(YTDLP, ['--no-playlist','--no-warnings','--format','bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b','--merge-output-format','mp4','--output',template,sourceUrl], { maxBuffer: 20 * 1024 * 1024 })
    const actual = [`${out}.mp4`,`${out}.webm`,`${out}.mkv`].find(existsSync)
    if (!actual) throw new Error('yt-dlp produced no source video')
    await writeFile(out, await readFile(actual))
  }
  const storagePath = `projects/${projectId}/source/source.mp4`
  const { error } = await supabase.storage.from('sources').upload(storagePath, await readFile(out), { contentType: 'video/mp4', upsert: true })
  if (!error) await supabase.from('videos').update({ storage_path: storagePath, file_size: (await readFile(out)).length }).eq('project_id', projectId)
  return out
}

async function brollFiles(config: ClipConfiguration, work: string): Promise<Broll[]> {
  const result: Broll[] = []
  for (let i = 0; i < (config.broll || []).length; i++) {
    const item = config.broll[i]
    if (!/^https?:\/\//i.test(item.videoUrl || '')) { console.warn(`[FFmpeg] B-roll ${i + 1}: invalid URL`); continue }
    const file = path.join(work, `broll-${i}.mp4`)
    try {
      await download(item.videoUrl, file)
      const p = await exec(FFPROBE, ['-v','error','-select_streams','v:0','-show_entries','stream=codec_type','-of','csv=p=0',file])
      if (p.stdout.trim() !== 'video') throw new Error('no video stream')
      result.push({ ...item, file })
    } catch (e) { console.warn(`[FFmpeg] B-roll ${i + 1} skipped: ${e instanceof Error ? e.message : String(e)}`) }
  }
  return result
}

function filters(config: ClipConfiguration, broll: Broll[], w: number, h: number) {
  const c = config.crop || { mode: 'center', x: .5, y: .5, scale: 1 }
  const scale = Math.max(1, num(c.scale, 1)); const cw = Math.max(2, Math.round(w / scale)); const ch = Math.max(2, Math.round(h / scale))
  const cx = c.mode === 'center' ? '(iw-ow)/2' : `iw*${Math.min(1,Math.max(0,num(c.x,.5)))}-${cw}/2`; const cy = c.mode === 'center' ? '(ih-oh)/2' : `ih*${Math.min(1,Math.max(0,num(c.y,.5)))}-${ch}/2`
  const f = [`[0:v]scale=${Math.max(w,cw)}:${Math.max(h,ch)}:force_original_aspect_ratio=increase,crop=${cw}:${ch}:max(0\,min(iw-ow\,${cx})):max(0\,min(ih-oh\,${cy})),scale=${w}:${h},setpts=PTS-STARTPTS[v0]`]
  let current = '[v0]'
  broll.forEach((b,i) => { const s=Math.max(0,num(b.startAt)), e=s+Math.max(.05,num(b.duration,3)); f.push(`[${i+1}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setpts=PTS-STARTPTS[b${i}]`); const next=`[v${i+1}]`; f.push(`${current}[b${i}]overlay=0:0:eof_action=pass:enable='between(t,${s.toFixed(3)},${e.toFixed(3)})'${next}`); current=next })
  if (config.captions?.enabled) for (const word of config.captions.words || []) { const s=Math.max(0,num(word.start)),e=Math.max(s+.05,num(word.end)),style=config.captions.style; const y=style.position==='top'?'h*.12':style.position==='center'?'(h-text_h)/2':'h*.78'; const next=`[t${f.length}]`; f.push(`${current}drawtext=text='${text(String(word.text||''))}':font='${text(style.font||'Arial')}':fontsize=${Math.max(18,num(style.fontSize,64))}:fontcolor=${style.textColor||'white'}:bordercolor=${style.strokeColor||'black'}:borderw=${Math.max(0,num(style.strokeWidth,6))}:x=(w-text_w)/2:y=${y}:enable='between(t,${s.toFixed(3)},${e.toFixed(3)})'${next}`); current=next }
  for (const o of config.overlays || []) { const s=Math.max(0,num(o.startAt)),e=s+Math.max(.05,num(o.duration,3)); const y=o.position==='top'?'h*.08':o.position==='center'?'(h-text_h)/2':'h*.9'; const next=`[o${f.length}]`; f.push(`${current}drawtext=text='${text(o.text||'')}':fontsize=48:fontcolor=${o.color||'white'}:bordercolor=black:borderw=4:x=(w-text_w)/2:y=${y}:enable='between(t,${s.toFixed(3)},${e.toFixed(3)})'${next}`); current=next }
  if (config.branding?.watermarkText) { const next=`[w${f.length}]`; f.push(`${current}drawtext=text='${text(config.branding.watermarkText)}':fontsize=28:fontcolor=white@.75:x=w-text_w-30:y=h-text_h-30${next}`); current=next }
  return { graph:f.join(';'), video:current }
}

async function render(config: ClipConfiguration, source: string, broll: Broll[], music: string | null, voice: string | null, out: string) {
  const w=Math.max(240,Math.round(num(config.resolution?.width,1080))), h=Math.max(240,Math.round(num(config.resolution?.height,1920))), start=Math.max(0,num(config.startTime)), duration=Math.max(.1,num(config.endTime,start+30)-start)
  const args=['-y','-ss',String(start),'-t',String(duration),'-i',source]; broll.forEach(b=>args.push('-stream_loop','-1','-i',b.file)); if(music)args.push('-stream_loop','-1','-i',music); if(voice)args.push('-i',voice)
  const vf=filters(config,broll,w,h); const audio=['[0:a]']; if(music)audio.push(`[${1+broll.length}:a]`); if(voice)audio.push(`[${1+broll.length+(music?1:0)}:a]`); const graph=[vf.graph]
  if(audio.length>1)graph.push(`${audio.join('')}amix=inputs=${audio.length}:duration=first:dropout_transition=2[aout]`); else graph.push(`[0:a]volume=${Math.max(0,num(config.originalVolume,1))}[aout]`)
  await exec(FFMPEG,['-y',...args.slice(1),'-filter_complex',graph.join(';'),'-map',vf.video,'-map','[aout]','-c:v','libx264','-preset',optional('FFMPEG_PRESET','veryfast'),'-crf',optional('FFMPEG_CRF','20'),'-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart','-t',String(duration),out],{maxBuffer:30*1024*1024})
}

async function processJob(job: Job) {
  const work=path.join(os.tmpdir(),`clipforge-${job.id}`); await rm(work,{recursive:true,force:true}); await mkdir(work,{recursive:true})
  try {
    await updateJob(job.id,{status:'RENDERING',stage:'LOADING_SOURCE',progress:5,started_at:new Date().toISOString(),error_message:null})
    const {data:v,error:ve}=await supabase.from('clip_versions').select('id,version_number,configuration_json').eq('id',job.clip_version_id).single(); if(ve||!v)throw new Error(ve?.message||'clip version not found')
    const {data:c,error:ce}=await supabase.from('clips').select('id,project_id').eq('id',job.clip_id).single(); if(ce||!c)throw new Error(ce?.message||'clip not found')
    const {data:p,error:pe}=await supabase.from('projects').select('id,source_type,source_url').eq('id',c.project_id).single(); if(pe||!p)throw new Error(pe?.message||'project not found')
    const config=v.configuration_json as ClipConfiguration; const source=await sourceFor(config,p.id,p.source_type,p.source_url,work)
    await updateJob(job.id,{stage:'DOWNLOADING_BROLL',progress:15}); const broll=await brollFiles(config,work)
    const fetchOptional=async(url:string|undefined|null,name:string)=>{if(!url||!/^https?:\/\//i.test(url))return null;const f=path.join(work,name);try{await download(url,f);return f}catch(e){console.warn(`[FFmpeg] ${name} skipped: ${e instanceof Error?e.message:String(e)}`);return null}}
    const music=await fetchOptional(config.music?.audioUrl,'music.bin'),voice=await fetchOptional(config.voiceUrl,'voice.bin')
    await updateJob(job.id,{stage:'FFMPEG_EDITING',progress:25}); const out=path.join(work,'finished.mp4'); await render(config,source,broll,music,voice,out)
    await updateJob(job.id,{stage:'VALIDATING',progress:88}); const probe=await exec(FFPROBE,['-v','error','-select_streams','v:0','-show_entries','stream=codec_type,width,height','-of','json',out]); const info=JSON.parse(probe.stdout||'{}'); if(!info.streams?.some((s:any)=>s.codec_type==='video'))throw new Error('finished MP4 has no video stream')
    await updateJob(job.id,{stage:'UPLOADING_RENDER',progress:93}); const key=`projects/${p.id}/renders/${c.id}-v${v.version_number}.mp4`; const {error:ue}=await supabase.storage.from('renders').upload(key,await readFile(out),{contentType:'video/mp4',upsert:true}); if(ue)throw new Error(`Render upload failed: ${ue.message}`)
    const renderUrl=supabase.storage.from('renders').getPublicUrl(key).data.publicUrl; let thumbUrl:string|null=null; const thumb=path.join(work,'thumbnail.jpg')
    try{await exec(FFMPEG,['-y','-i',out,'-frames:v','1','-q:v','2',thumb]);const tk=`projects/${p.id}/renders/${c.id}-v${v.version_number}.jpg`;const {error}=await supabase.storage.from('renders').upload(tk,await readFile(thumb),{contentType:'image/jpeg',upsert:true});if(!error)thumbUrl=supabase.storage.from('renders').getPublicUrl(tk).data.publicUrl}catch(e){console.warn(`[FFmpeg] thumbnail skipped: ${e instanceof Error?e.message:String(e)}`)}
    const {error:vu}=await supabase.from('clip_versions').update({render_url:renderUrl,thumbnail_url:thumbUrl,status:'COMPLETED'}).eq('id',v.id); if(vu)throw new Error(`Version update failed: ${vu.message}`)
    const {error:cu}=await supabase.from('clips').update({current_version_id:v.id,current_render_url:renderUrl,current_thumbnail_url:thumbUrl,status:'RENDERED'}).eq('id',c.id); if(cu)throw new Error(`Clip update failed: ${cu.message}`)
    await updateJob(job.id,{status:'COMPLETED',stage:'COMPLETED',progress:100,completed_at:new Date().toISOString(),output_url:renderUrl,thumbnail_url:thumbUrl,error_message:null}); console.log(`[FFmpeg] COMPLETE ${renderUrl}`)
  }catch(e){const message=e instanceof Error?e.message:String(e);console.error(`[FFmpeg] FAILED ${job.id}: ${message}`);await updateJob(job.id,{status:'FAILED',stage:'FAILED',error_message:message})}finally{await rm(work,{recursive:true,force:true}).catch(()=>undefined)}
}

async function main(){await exec(FFMPEG,['-version']);await exec(FFPROBE,['-version']);console.log('========================================');console.log('ClipForge FFmpeg production worker active.');console.log('Waiting for QUEUED render jobs...');console.log('========================================');for(;;){const {data,error}=await supabase.from('render_jobs').select('id,clip_id,clip_version_id').eq('status','QUEUED').order('created_at',{ascending:true}).limit(1);if(error){console.error(`[FFmpeg] queue error: ${error.message}`);await sleep(3000);continue}const job=data?.[0] as Job|undefined;if(!job){await sleep(2000);continue}const {data:claimed}=await supabase.from('render_jobs').update({status:'CLAIMED',stage:'CLAIMED',progress:1}).eq('id',job.id).eq('status','QUEUED').select('id').maybeSingle();if(!claimed)continue;await processJob(job)}}
main().catch(e=>{console.error('[FFmpeg] Worker stopped:',e);process.exit(1)})
