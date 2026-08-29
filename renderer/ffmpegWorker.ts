import 'dotenv/config'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import type { ClipConfiguration, BrollConfigItem } from './src/types'

const require = createRequire(import.meta.url)
// ffmpeg-static's bundled binary is missing the drawtext filter entirely
// (verified: 0 hits in `ffmpeg -filters`, despite its own version banner
// claiming --enable-libfreetype/--enable-fontconfig support) — every
// caption-burning render was failing with "No such filter: 'drawtext'".
// @ffmpeg-installer/ffmpeg is an older build (~2018) but does have it, and
// nothing else this worker does (scale/crop/overlay/drawtext/libx264/aac)
// needs anything newer.
const bundledFfmpeg = require('@ffmpeg-installer/ffmpeg').path as string | null
const bundledFfprobe = require('ffprobe-static') as { path?: string }

// Font files downloaded at build time by scripts/install-fonts.mjs, used
// via drawtext's fontfile= instead of font=. The container has no
// fontconfig set up at all ("Fontconfig error: Cannot load default config
// file"), so resolving a font *name* through fontconfig always fails —
// pointing drawtext at an actual font *file* sidesteps that entirely.
const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', 'fonts')
const FONT_FILES: Record<string, string> = {
  'inter': path.join(FONTS_DIR, 'Inter.ttf'),
  'bebas neue': path.join(FONTS_DIR, 'BebasNeue.ttf'),
  'montserrat': path.join(FONTS_DIR, 'Montserrat.ttf'),
}
function resolveFontFile(family: string | undefined): string {
  const key = (family || '').trim().toLowerCase()
  const candidate = FONT_FILES[key] || FONT_FILES['inter']
  return existsSync(candidate) ? candidate : FONT_FILES['inter']
}

const run = promisify(execFile)
const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`Missing required environment variable: ${name}`); return value }
const SUPABASE_URL = required('SUPABASE_URL')
const SERVICE_KEY = required('SUPABASE_SERVICE_ROLE_KEY')
const FFMPEG = process.env.FFMPEG_PATH?.trim() || bundledFfmpeg || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH?.trim() || bundledFfprobe?.path || 'ffprobe'
const YTDLP = process.env.YTDLP_PATH?.trim() || 'yt-dlp'
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

type Job = { id: string; clip_id: string; clip_version_id: string }
type Version = { id: string; version_number: number; configuration_json: ClipConfiguration }

async function updateJob(id: string, fields: Record<string, unknown>) { const { error } = await supabase.from('render_jobs').update(fields).eq('id', id); if (error) console.error(`[FFmpeg] job update failed: ${error.message}`) }
function num(v: unknown, fallback = 0) { const x = Number(v); return Number.isFinite(x) ? x : fallback }
// ffmpeg's filtergraph string parser is used for fontfile= / textfile=
// path values here (not for caption text — see makeFilters below, which
// uses textfile= specifically to avoid this). Colon-escaping is confirmed
// to work; apostrophe-escaping inside a '...'-quoted value is NOT reliable
// on all ffmpeg builds (verified empirically against the deployed build —
// the commonly-documented '\'' close/insert/reopen trick silently produced
// no text at all), so don't rely on it for arbitrary text again.
function shellText(v: string) { return v.replace(/\\/g,'\\\\').replace(/:/g,'\\:').replace(/'/g,"\\'").replace(/%/g,'\\%').replace(/\n/g,' ') }
const RAPID_KEY = process.env.RAPIDAPI_KEY?.trim() || process.env.VITE_RAPIDAPI_KEY?.trim()
const RAPID_HOST = process.env.RAPIDAPI_HOST?.trim() || 'youtube-media-downloader.p.rapidapi.com'

async function download(url: string, file: string) { const response = await fetch(url, { redirect: 'follow' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const bytes = Buffer.from(await response.arrayBuffer()); if (!bytes.length) throw new Error('empty download'); await writeFile(file, bytes) }
async function signedSource(storagePath: string) { const { data, error } = await supabase.storage.from('sources').createSignedUrl(storagePath, 21600); if (error || !data?.signedUrl) throw new Error(error?.message || 'cannot create source signed URL'); return data.signedUrl }

async function downloadYoutube(url: string, out: string) {
  if (RAPID_KEY) { try { const response = await fetch(`https://${RAPID_HOST}/v2/video/download?url=${encodeURIComponent(url)}`, { headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST } }); if (!response.ok) throw new Error(`RapidAPI HTTP ${response.status}`); const type = response.headers.get('content-type') || ''; if (!type.includes('json')) { const bytes = Buffer.from(await response.arrayBuffer()); if (!bytes.length) throw new Error('RapidAPI returned an empty file'); await writeFile(out, bytes); return } const data: any = await response.json(); const urls = [data?.downloadUrl,data?.download_url,data?.url,data?.link,data?.data?.downloadUrl,data?.data?.download_url,data?.data?.url,Array.isArray(data?.data)?data.data[0]?.url:null,Array.isArray(data?.formats)?data.formats.find((x:any)=>typeof x?.url==='string')?.url:null]; const media = urls.find((x): x is string => typeof x === 'string' && x.length > 0); if (!media) throw new Error('RapidAPI returned no media URL'); await download(media,out); return } catch (error) { console.warn(`[FFmpeg] RapidAPI failed: ${error instanceof Error ? error.message : String(error)}`) } }
  // Same YTDLP_COOKIES support as pipeline.ts: paste a Netscape-format
  // cookies.txt export from a logged-in YouTube session to work around
  // "Sign in to confirm you're not a bot" on datacenter IPs.
  const cookiesArgs: string[] = []
  if (process.env.YTDLP_COOKIES) { const cookiesPath = `${out}.cookies.txt`; try { await writeFile(cookiesPath, process.env.YTDLP_COOKIES); cookiesArgs.push('--cookies', cookiesPath) } catch (error) { console.warn(`[FFmpeg] Failed to write YTDLP_COOKIES, continuing without cookies: ${error instanceof Error ? error.message : String(error)}`) } }
  const template = `${out}.%(ext)s`
  try {
    await run(YTDLP,['--no-playlist','--no-warnings','--format','bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b','--merge-output-format','mp4','--output',template,'--extractor-args','youtube:player_client=android',url],{maxBuffer:20*1024*1024})
  } catch (androidError) {
    console.warn(`[FFmpeg] yt-dlp (android client) failed, retrying with default client: ${androidError instanceof Error ? androidError.message : String(androidError)}`)
    await run(YTDLP,['--no-playlist','--no-warnings','--format','bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b','--merge-output-format','mp4','--output',template,...cookiesArgs,url],{maxBuffer:20*1024*1024})
  }
  const file=[`${out}.mp4`,`${out}.webm`,`${out}.mkv`].find(existsSync); if (!file) throw new Error('yt-dlp finished without an output file'); await writeFile(out,await readFile(file))
}

async function getSource(projectId: string, sourceType: string|null, sourceUrl: string|null, work: string, configuredSource?: string) {
  const out=path.join(work,'source.mp4')
  const configured = configuredSource?.trim() || ''
  if (configured.startsWith('projects/')) {
    console.log(`[FFmpeg] Using clip-specific source: ${configured}`)
    await download(await signedSource(configured), out)
    return out
  }
  const {data}=await supabase.from('videos').select('storage_path').eq('project_id',projectId).maybeSingle()
  const storage=typeof data?.storage_path==='string'?data.storage_path.trim():''
  if(storage.startsWith('projects/')) { await download(await signedSource(storage),out); return out }
  if(sourceType==='youtube'&&sourceUrl) { await downloadYoutube(sourceUrl,out); const saved=`projects/${projectId}/source/source.mp4`; const {error}=await supabase.storage.from('sources').upload(saved,await readFile(out),{contentType:'video/mp4',upsert:true}); if(!error) await supabase.from('videos').update({storage_path:saved}).eq('project_id',projectId); return out }
  throw new Error('No usable source video found')
}

async function getBroll(config: ClipConfiguration, work: string) {
  const result:Array<BrollConfigItem & { file:string }>=[]
  for(let i=0;i<(config.broll||[]).length;i++){ const item=config.broll[i]; const url=(item?.videoUrl||'').trim(); if(!/^https?:\/\//i.test(url)) { console.warn(`[FFmpeg] B-roll ${i+1}: missing HTTP video URL`); continue } const file=path.join(work,`broll-${i}.bin`); try { await download(url,file); const probe=await run(FFPROBE,['-v','error','-select_streams','v:0','-show_entries','stream=codec_type','-of','csv=p=0',file]); if(probe.stdout.trim()!=='video') throw new Error('no video stream'); result.push({...item,file}); console.log(`[FFmpeg] B-roll ${i+1} ready`) } catch(error) { console.warn(`[FFmpeg] B-roll ${i+1} skipped: ${error instanceof Error?error.message:String(error)}`) } }
  return result
}

async function optional(url:string|undefined|null,work:string,name:string){ if(!url||!/^https?:\/\//i.test(url)) return null; const file=path.join(work,name); try{await download(url,file);return file}catch(error){console.warn(`[FFmpeg] ${name} skipped: ${error instanceof Error?error.message:String(error)}`);return null} }

async function makeFilters(config:ClipConfiguration,broll:Array<BrollConfigItem & {file:string}>,music:boolean,voice:boolean,w:number,h:number,work:string){
  const filters:string[]=[]; filters.push(`[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setpts=PTS-STARTPTS[base]`); let video='[base]'
  broll.forEach((b,i)=>{const start=Math.max(0,num(b.startAt));const end=start+Math.max(.05,num(b.duration,1));filters.push(`[${i+1}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setpts=PTS-STARTPTS[b${i}]`);const next=`[v${i}]`;filters.push(`${video}[b${i}]overlay=0:0:eof_action=pass:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'${next}`);video=next})
  // Caption text goes through drawtext's textfile= (one small .txt per word,
  // written into the job's temp dir) instead of an inline text='...' value.
  // ffmpeg's filtergraph parser doesn't treat backslash as an escape
  // character inside a single-quoted value, so any word containing a
  // literal apostrophe (you'll, it's, don't...) desyncs the quote boundary
  // and corrupts the rest of that filter, including the enable='between(...)'
  // clause right after it — silently breaking every render on those words.
  // textfile= reads the text verbatim from disk, so no escaping is needed
  // at all, for apostrophes or anything else.
  const style=config.captions?.style; let wordIndex=0
  for(const word of config.captions?.enabled?(config.captions.words||[]):[]){
    const text=(word?.text||'').trim();if(!text)continue
    const s=Math.max(0,num(word.start)-num(config.startTime));const e=Math.max(s+.05,num(word.end)-num(config.startTime))
    const y=style?.position==='top'?'h*0.12':style?.position==='center'?'(h-text_h)/2':'h*0.78'
    const textFile=path.join(work,`caption-${wordIndex++}.txt`)
    await writeFile(textFile,text)
    const next=`[c${filters.length}]`
    filters.push(`${video}drawtext=textfile='${shellText(textFile)}':fontfile='${shellText(resolveFontFile(style?.font))}':fontsize=${Math.max(18,num(style?.fontSize,64))}:fontcolor=${style?.textColor||'white'}:bordercolor=${style?.strokeColor||'black'}:borderw=${Math.max(0,num(style?.strokeWidth,6))}:x=(w-text_w)/2:y=${y}:enable='between(t,${s.toFixed(3)},${e.toFixed(3)})'${next}`)
    video=next
  }
  let audio='[0:a]'; if(music||voice){const inputs=['[0:a]'];if(music)inputs.push(`[${broll.length+1}:a]`);if(voice)inputs.push(`[${broll.length+1+(music?1:0)}:a]`);filters.push(`${inputs.join('')}amix=inputs=${inputs.length}:duration=first:dropout_transition=2[aout]`);audio='[aout]'} return {graph:filters.join(';'),video,audio}
}

async function render(config:ClipConfiguration,sourceFile:string,broll:Array<BrollConfigItem & {file:string}>,music:string|null,voice:string|null,out:string,work:string){
  const w=Math.max(240,Math.round(num(config.resolution?.width,1080)));const h=Math.max(240,Math.round(num(config.resolution?.height,1920)));const start=Math.max(0,num(config.startTime));const duration=Math.max(.05,num(config.endTime,start+30)-start);const args=['-y','-ss',String(start),'-t',String(duration),'-i',sourceFile];broll.forEach(b=>args.push('-i',b.file));if(music)args.push('-i',music);if(voice)args.push('-i',voice);const f=await makeFilters(config,broll,Boolean(music),Boolean(voice),w,h,work);args.push('-filter_complex',f.graph,'-map',f.video,'-map',f.audio,'-c:v','libx264','-preset',process.env.FFMPEG_PRESET||'veryfast','-crf',process.env.FFMPEG_CRF||'20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart','-shortest',out);await run(FFMPEG,args,{maxBuffer:20*1024*1024})
}

async function processJob(job:Job){
  const work=path.join(os.tmpdir(),`clipforge-${job.id}`);await rm(work,{recursive:true,force:true});await mkdir(work,{recursive:true});
  try{await updateJob(job.id,{status:'RENDERING',stage:'LOADING_SOURCE',progress:2,started_at:new Date().toISOString(),error_message:null});const {data:v,error:ve}=await supabase.from('clip_versions').select('id,version_number,configuration_json').eq('id',job.clip_version_id).single();if(ve||!v)throw new Error(ve?.message||'clip version not found');const version=v as Version;const {data:c,error:ce}=await supabase.from('clips').select('id,project_id').eq('id',job.clip_id).single();if(ce||!c)throw new Error(ce?.message||'clip not found');const {data:p,error:pe}=await supabase.from('projects').select('id,source_type,source_url').eq('id',c.project_id).single();if(pe||!p)throw new Error(pe?.message||'project not found');const config={...version.configuration_json};const sourceFile=await getSource(p.id,p.source_type,p.source_url,work,config.sourceVideo);await updateJob(job.id,{stage:'DOWNLOADING_BROLL',progress:12});const broll=await getBroll(config,work);const music=await optional(config.music?.audioUrl,work,'music.bin');const voice=await optional(config.voiceUrl,work,'voice.bin');await updateJob(job.id,{stage:'FFMPEG_EDITING',progress:20});const out=path.join(work,'finished.mp4');await render(config,sourceFile,broll,music,voice,out,work);await updateJob(job.id,{stage:'VALIDATING',progress:88});const probe=await run(FFPROBE,['-v','error','-select_streams','v:0','-show_entries','stream=codec_type','-of','csv=p=0',out]);if(probe.stdout.trim()!=='video')throw new Error('FFmpeg produced no video stream');await updateJob(job.id,{stage:'UPLOADING_RENDER',progress:92});const key=`projects/${p.id}/renders/${c.id}-v${version.version_number}.mp4`;const {error:ue}=await supabase.storage.from('renders').upload(key,await readFile(out),{contentType:'video/mp4',upsert:true});if(ue)throw new Error(`Render upload failed: ${ue.message}`);const renderUrl=supabase.storage.from('renders').getPublicUrl(key).data.publicUrl;let thumbUrl:string|null=null;try{const thumb=path.join(work,'thumbnail.jpg');await run(FFMPEG,['-y','-i',out,'-frames:v','1','-q:v','2',thumb]);const tk=`projects/${p.id}/thumbnails/${c.id}-v${version.version_number}.jpg`;const {error:te}=await supabase.storage.from('renders').upload(tk,await readFile(thumb),{contentType:'image/jpeg',upsert:true});if(!te)thumbUrl=supabase.storage.from('renders').getPublicUrl(tk).data.publicUrl}catch(e){console.warn(`[FFmpeg] thumbnail failed: ${e instanceof Error?e.message:String(e)}`)}const {error:vue}=await supabase.from('clip_versions').update({render_url:renderUrl,thumbnail_url:thumbUrl,status:'RENDERED'}).eq('id',version.id);if(vue)throw new Error(`Version update failed: ${vue.message}`);const {error:cue}=await supabase.from('clips').update({current_version_id:version.id,current_render_url:renderUrl,current_thumbnail_url:thumbUrl,status:'RENDERED'}).eq('id',c.id);if(cue)throw new Error(`Clip update failed: ${cue.message}`);await updateJob(job.id,{status:'COMPLETED',stage:'COMPLETED',progress:100,completed_at:new Date().toISOString()});console.log(`[FFmpeg] FINISHED: ${renderUrl}`)}catch(error){const message=error instanceof Error?error.message:String(error);console.error(`[FFmpeg] FAILED: ${message}`);await updateJob(job.id,{status:'FAILED',stage:'FAILED',error_message:message})}finally{await rm(work,{recursive:true,force:true}).catch(()=>undefined)}}

async function main(){console.log('========================================');console.log('ClipForge FFmpeg worker active.');console.log('Waiting for QUEUED render jobs...');console.log(`FFmpeg: ${FFMPEG}`);console.log(`ffprobe: ${FFPROBE}`);console.log('========================================');await run(FFMPEG,['-version'],{maxBuffer:2*1024*1024});await run(FFPROBE,['-version'],{maxBuffer:2*1024*1024});for(;;){const {data,error}=await supabase.from('render_jobs').select('id,clip_id,clip_version_id').eq('status','QUEUED').order('created_at',{ascending:true}).limit(1);if(error){console.error(`[FFmpeg] Queue error: ${error.message}`);await new Promise(r=>setTimeout(r,3000));continue}const job=data?.[0] as Job|undefined;if(!job){await new Promise(r=>setTimeout(r,3000));continue}const {data:claimed,error:claimError}=await supabase.from('render_jobs').update({status:'CLAIMED'}).eq('id',job.id).eq('status','QUEUED').select('id').maybeSingle();if(claimError||!claimed)continue;await processJob(job)}}
main().catch(error=>{console.error('[FFmpeg] Worker stopped:',error);process.exit(1)})
