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
const env = (n: string) => { const v = process.env[n]?.trim(); if (!v) throw new Error(`Missing required environment variable: ${n}`); return v }
const SUPABASE_URL = env('SUPABASE_URL')
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY')
const RAPID_KEY = process.env.RAPIDAPI_KEY?.trim() || process.env.VITE_RAPIDAPI_KEY?.trim()
const RAPID_HOST = process.env.RAPIDAPI_HOST?.trim() || 'youtube-media-downloader.p.rapidapi.com'
const FFMPEG = process.env.FFMPEG_PATH?.trim() || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH?.trim() || 'ffprobe'
const YTDLP = process.env.YTDLP_PATH?.trim() || 'yt-dlp'
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

type Job = { id: string; clip_id: string; clip_version_id: string }
type Version = { id: string; version_number: number; configuration_json: ClipConfiguration }

auto: {
function n(v: unknown, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d }
function esc(v: string) { return v.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/%/g, '\\%').replace(/\n/g, ' ') }
async function jobUpdate(id: string, fields: Record<string, unknown>) { const { error } = await supabase.from('render_jobs').update(fields).eq('id', id); if (error) console.error(`[FFmpeg] job update: ${error.message}`) }
async function download(url: string, file: string) { const r = await fetch(url, { redirect: 'follow' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); const b = Buffer.from(await r.arrayBuffer()); if (!b.length) throw new Error('empty download'); await writeFile(file, b) }
async function signed(pathName: string) { const { data, error } = await supabase.storage.from('sources').createSignedUrl(pathName, 21600); if (error || !data?.signedUrl) throw new Error(error?.message || 'cannot sign source'); return data.signedUrl }
async function youtube(url: string, out: string) {
  if (RAPID_KEY) { try { const r = await fetch(`https://${RAPID_HOST}/v2/video/download?url=${encodeURIComponent(url)}`, { headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST } }); if (!r.ok) throw new Error(`RapidAPI HTTP ${r.status}`); const type = r.headers.get('content-type') || ''; if (!type.includes('json')) { await writeFile(out, Buffer.from(await r.arrayBuffer())); return } const d: any = await r.json(); const candidates = [d?.downloadUrl,d?.download_url,d?.url,d?.link,d?.data?.downloadUrl,d?.data?.download_url,d?.data?.url,Array.isArray(d?.data)?d.data[0]?.url:null,Array.isArray(d?.formats)?d.formats.find((x:any)=>typeof x?.url==='string')?.url:null]; const u = candidates.find((x): x is string => typeof x === 'string' && x.length > 0); if (!u) throw new Error('RapidAPI returned no media URL'); await download(u, out); return } catch (e) { console.warn(`[FFmpeg] RapidAPI download failed: ${e instanceof Error ? e.message : String(e)}`) } }
  const template = `${out}.%(ext)s`; await exec(YTDLP, ['--no-playlist','--no-warnings','--format','bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b','--merge-output-format','mp4','--output',template,url], { maxBuffer: 10 * 1024 * 1024 }); const f = [`${out}.mp4`,`${out}.webm`,`${out}.mkv`].find(existsSync); if (!f) throw new Error('yt-dlp produced no video'); await writeFile(out, await readFile(f))
}
async function source(projectId: string, sourceType: string | null, sourceUrl: string | null, work: string) {
  const out = path.join(work, 'source.mp4'); const { data: v } = await supabase.from('videos').select('storage_path').eq('project_id', projectId).maybeSingle(); const p = typeof v?.storage_path === 'string' ? v.storage_path.trim() : ''
  if (p.startsWith('projects/')) { await download(await signed(p), out); return out }
  if (sourceType === 'youtube' && sourceUrl) { await youtube(sourceUrl, out); const saved = `projects/${projectId}/source/source.mp4`; const { error } = await supabase.storage.from('sources').upload(saved, await readFile(out), { contentType:'video/mp4', upsert:true }); if (!error) await supabase.from('videos').update({ storage_path:saved }).eq('project_id',projectId); return out }
  throw new Error('No usable source video found')
}
async function assets(config: ClipConfiguration, work: string) {
  const out: Array<BrollConfigItem & { file:string }> = []
  for (let i=0;i<(config.broll||[]).length;i++) { const b=config.broll[i]; const u=(b?.videoUrl||'').trim(); if (!/^https?:\\/\\//i.test(u)) continue; const file=path.join(work,`broll-${i}.mp4`); try { await download(u,file); const p=await exec(FFPROBE,['-v','error','-select_streams','v:0','-show_entries','stream=codec_type','-of','csv=p=0',file]); if (p.stdout.trim()==='video') out.push({...b,file}) } catch(e) { console.warn(`[FFmpeg] B-roll ${i+1} skipped: ${e instanceof Error ? e.message : String(e)}`) } }
  return out
}
async function optionalAsset(url: string | null | undefined, work: string, name: string) { if (!url || !/^https?:\\/\\//i.test(url)) return null; const f=path.join(work,name); try { await download(url,f); return f } catch(e) { console.warn(`[FFmpeg] optional asset skipped: ${e instanceof Error ? e.message : String(e)}`); return null } }
function filters(config: ClipConfiguration, broll: Array<BrollConfigItem & {file:string}>, hasMusic: boolean, hasVoice: boolean, width: number, height: number) {
  const f: string[]=[]; f.push(`[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setpts=PTS-STARTPTS[base]`); let cur='[base]'
  broll.forEach((b,i)=>{ const s=Math.max(0,n(b.startAt)); const e=s+Math.max(.05,n(b.duration,1)); f.push(`[${i+1}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setpts=PTS-STARTPTS[b${i}]`); const next=`[bmix${i}]`; f.push(`${cur}[b${i}]overlay=0:0:eof_action=pass:enable='between(t,${s},${e})'${next}`); cur=next })
  const words=config.captions?.enabled ? (config.captions.words||[]) : []; const style=config.captions?.style; for(const w of words){ const text=(w?.text||'').trim(); if(!text) continue; const s=Math.max(0,n(w.start)-n(config.startTime)); const e=Math.max(s+.05,n(w.end)-n(config.startTime)); const y=style?.position==='top'?'h*0.12':style?.position==='center'?'(h-text_h)/2':'h*0.78'; f.push(`${cur}drawtext=text='${esc(text)}':font='${esc(style?.font||'Arial')}':fontsize=${Math.max(18,n(style?.fontSize,64))}:fontcolor=${style?.textColor||'white'}:bordercolor=${style?.strokeColor||'black'}:borderw=${Math.max(0,n(style?.strokeWidth,6))}:x=(w-text_w)/2:y=${y}:enable='between(t,${s.toFixed(3)},${e.toFixed(3)})'[txt${f.length}]`); cur=`[txt${f.length-1}]` }
  let audio='[0:a]'; if(hasMusic||hasVoice){ const inputs=['[0:a]']; if(hasMusic) inputs.push(`[${broll.length+1}:a]`); if(hasVoice) inputs.push(`[${broll.length+1+(hasMusic?1:0)}:a]`); f.push(`${inputs.join('')}amix=inputs=${inputs.length}:duration=first:dropout_transition=2[aout]`); audio='[aout]' }
  return { graph:f.join(';'), video:cur, audio }
}
async function render(config: ClipConfiguration, sourceFile: string, broll: Array<BrollConfigItem & {file:string}>, music: string|null, voice: string|null, out: string) {
  const width=Math.max(240,Math.round(n(config.resolution?.width,1080))); const height=Math.max(240,Math.round(n(config.resolution?.height,1920))); const start=Math.max(0,n(config.startTime)); const duration=Math.max(.05,n(config.endTime,start+30)-start); const speed=Math.max(.1,n(config.speed,1)); const args=['-y','-ss',String(start),'-t',String(duration),'-i',sourceFile]; broll.forEach(b=>args.push('-i',b.file)); if(music) args.push('-i',music); if(voice) args.push('-i',voice); const z=filters(config,broll,Boolean(music),Boolean(voice),width,height); args.push('-filter_complex',z.graph,'-map',z.video); if(z.audio) args.push('-map',z.audio); else args.push('-an'); args.push('-c:v','libx264','-preset',process.env.FFMPEG_PRESET||'veryfast','-crf',process.env.FFMPEG_CRF||'20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart','-shortest',out); await exec(FFMPEG,args,{maxBuffer:20*1024*1024})
}
async function processJob(job: Job) {
  const work=path.join(os.tmpdir(),`clipforge-${job.id}`); await rm(work,{recursive:true,force:true}); await mkdir(work,{recursive:true});
  try {
    await jobUpdate(job.id,{status:'RENDERING',stage:'LOADING_SOURCE',progress:2,started_at:new Date().toISOString(),error_message:null})
    const {data:v,error:ve}=await supabase.from('clip_versions').select('id,version_number,configuration_json').eq('id',job.clip_version_id).single(); if(ve||!v) throw new Error(ve?.message||'clip version not found'); const version=v as Version
    const {data:c,error:ce}=await supabase.from('clips').select('id,project_id').eq('id',job.clip_id).single(); if(ce||!c) throw new Error(ce?.message||'clip not found')
    const {data:p,error:pe}=await supabase.from('projects').select('id,source_type,source_url').eq('id',c.project_id).single(); if(pe||!p) throw new Error(pe?.message||'project not found')
    const config={...version.configuration_json}; const sourceFile=await source(p.id,p.source_type,p.source_url,work)
    await jobUpdate(job.id,{stage:'DOWNLOADING_BROLL',progress:12}); const broll=await assets(config,work)
    const music=await optionalAsset(config.music?.audioUrl,work,'music'); const voice=await optionalAsset(config.voiceUrl,work,'voice')
    await jobUpdate(job.id,{stage:'FFMPEG_EDITING',progress:20}); const out=path.join(work,'finished.mp4'); await render(config,sourceFile,broll,music,voice,out)
    await jobUpdate(job.id,{stage:'VALIDATING',progress:88}); const probe=await exec(FFPROBE,['-v','error','-select_streams','v:0','-show_entries','stream=codec_type','-of','csv=p=0',out]); if(probe.stdout.trim()!=='video') throw new Error('FFmpeg produced no video stream')
    await jobUpdate(job.id,{stage:'UPLOADING_RENDER',progress:92}); const key=`projects/${p.id}/renders/${c.id}-v${version.version_number}.mp4`; const {error:ue}=await supabase.storage.from('renders').upload(key,await readFile(out),{contentType:'video/mp4',upsert:true}); if(ue) throw new Error(`Render upload failed: ${ue.message}`); const renderUrl=supabase.storage.from('renders').getPublicUrl(key).data.publicUrl
    let thumbnailUrl:string|null=null; try { const thumb=path.join(work,'thumbnail.jpg'); await exec(FFMPEG,['-y','-i',out,'-frames:v','1','-q:v','2',thumb]); const tk=`projects/${p.id}/thumbnails/${c.id}-v${version.version_number}.jpg`; const {error:te}=await supabase.storage.from('renders').upload(tk,await readFile(thumb),{contentType:'image/jpeg',upsert:true}); if(!te) thumbnailUrl=supabase.storage.from('renders').getPublicUrl(tk).data.publicUrl } catch(e){ console.warn(`[FFmpeg] thumbnail failed: ${e instanceof Error ? e.message : String(e)}`) }
    const {error:vue}=await supabase.from('clip_versions').update({render_url:renderUrl,thumbnail_url:thumbnailUrl,status:'RENDERED'}).eq('id',version.id); if(vue) throw new Error(`Version update failed: ${vue.message}`)
    const {error:cue}=await supabase.from('clips').update({current_version_id:version.id,current_render_url:renderUrl,current_thumbnail_url:thumbnailUrl,status:'RENDERED'}).eq('id',c.id); if(cue) throw new Error(`Clip update failed: ${cue.message}`)
    await jobUpdate(job.id,{status:'COMPLETED',stage:'COMPLETED',progress:100,completed_at:new Date().toISOString()}); console.log(`[FFmpeg] DONE ${job.id}: ${renderUrl}`)
  } catch(e) { const message=e instanceof Error?e.message:String(e); console.error(`[FFmpeg] FAILED ${job.id}: ${message}`); await jobUpdate(job.id,{status:'FAILED',stage:'FAILED',error_message:message}) } finally { await rm(work,{recursive:true,force:true}).catch(()=>undefined) }
}
async function main(){ console.log('========================================'); console.log('ClipForge FFmpeg worker active.'); console.log('Waiting for QUEUED render jobs...'); console.log('========================================'); await exec(FFMPEG,['-version'],{maxBuffer:2*1024*1024}); await exec(FFPROBE,['-version'],{maxBuffer:2*1024*1024}); for(;;){ const {data,error}=await supabase.from('render_jobs').select('id,clip_id,clip_version_id').eq('status','QUEUED').order('created_at',{ascending:true}).limit(1); if(error){console.error(`[FFmpeg] Queue error: ${error.message}`);await new Promise(r=>setTimeout(r,3000));continue} const job=data?.[0] as Job|undefined; if(!job){await new Promise(r=>setTimeout(r,3000));continue} const {data:claimed,error:claimError}=await supabase.from('render_jobs').update({status:'CLAIMED'}).eq('id',job.id).eq('status','QUEUED').select('id').maybeSingle(); if(claimError||!claimed){continue} await processJob(job) } }
main().catch(e=>{console.error('[FFmpeg] Worker stopped:',e);process.exit(1)})
}
