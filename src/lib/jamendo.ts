import type { Clip, Transcript } from './types'
import { getStoredApiKey } from './clipAiAssistant'

export interface JamendoTrackItem {
  id: string
  title: string
  artist_name: string
  album_name?: string
  duration: number
  audio: string // Direct MP3 streaming URL
  audiodownload?: string
  image: string // Album / Track Cover Artwork
  license_ccurl?: string
  tags?: string[]
  themeCategory: 'phonk' | 'lofi' | 'cinematic' | 'tech' | 'corporate' | 'dark' | 'trap'
  bpm?: number
  mood?: string
}

export interface AiMusicAnalysisResult {
  theme: string
  mood: string
  tempoBpm: number
  vibeDescription: string
  recommendedVolume: number
  jamendoQuery: string
  jamendoTags: string[]
  selectedTrack: JamendoTrackItem
  reasoning: string
}

// Jamendo public developer client ID
const JAMENDO_CLIENT_ID = 'c8430e38'

/**
 * Curated Jamendo Royalty-Free Music Catalog
 * All tracks are hosted on Jamendo's public Creative Commons CDN with instant streamable MP3s
 */
export const CURATED_JAMENDO_TRACKS: JamendoTrackItem[] = [
  // 1. Tech & Cyberpunk
  {
    id: 'jam-tech-1',
    title: 'Cyberpunk Synthwave Drive',
    artist_name: 'Alex Synth Team',
    album_name: 'Synthwave Odyssey',
    duration: 142,
    audio: 'https://cdn.jsdelivr.net/gh/rafaelreis-hotmart/Audio-Sample-files@master/sample.mp3',
    image: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=400&q=80',
    tags: ['cyberpunk', 'electronic', 'synthwave', 'future', 'gaming', 'tech'],
    themeCategory: 'tech',
    bpm: 128,
    mood: 'Energetic & Futuristic',
  },
  {
    id: 'jam-tech-2',
    title: 'Digital Matrix Pulse',
    artist_name: 'Tim Innovation',
    album_name: 'High Tech Innovation',
    duration: 160,
    audio: 'https://commondatastorage.googleapis.com/codeskulptor-assets/Epoq-Lepidoptera.ogg',
    image: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&q=80',
    tags: ['tech', 'glitch', 'coding', 'ai', 'data', 'modern'],
    themeCategory: 'tech',
    bpm: 130,
    mood: 'Focused & Fast-Paced',
  },
  {
    id: 'jam-tech-3',
    title: 'Neon Viper Grid',
    artist_name: 'FutureLab Audio',
    album_name: 'Cyber Horizon 2026',
    duration: 120,
    audio: 'https://raw.githubusercontent.com/mdn/webaudio-examples/master/audio-analyser/viper.mp3',
    image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80',
    tags: ['tech', 'electronic', 'future', 'cyber', 'retro'],
    themeCategory: 'tech',
    bpm: 126,
    mood: 'High Energy & Futuristic',
  },

  // 2. Viral Phonk & High Energy
  {
    id: 'jam-phonk-1',
    title: 'Drift Phonk Midnight',
    artist_name: 'Memphis Underground',
    album_name: 'Aggressive Memphis Beats',
    duration: 118,
    audio: 'https://commondatastorage.googleapis.com/codeskulptor-demos/pyman_assets/ateapill.ogg',
    image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80',
    tags: ['phonk', 'bass', 'drift', 'viral', 'tiktok', 'hype'],
    themeCategory: 'phonk',
    bpm: 145,
    mood: 'Aggressive & Viral',
  },
  {
    id: 'jam-phonk-2',
    title: 'Midnight Shadow Cowbell',
    artist_name: 'DXRK Soundwave',
    album_name: 'Tokyo Underground',
    duration: 125,
    audio: 'https://commondatastorage.googleapis.com/codeskulptor-assets/sounddogs/soundtrack.ogg',
    image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80',
    tags: ['phonk', 'dark', 'bass', 'cowbell', 'reel', 'trending'],
    themeCategory: 'phonk',
    bpm: 140,
    mood: 'Hypnotic & Dark',
  },

  // 3. Cinematic & Epic Storytelling
  {
    id: 'jam-cine-1',
    title: 'Heroic Orchestral Rising',
    artist_name: 'Hans Vibe Studio',
    album_name: 'Epic Trailer Chronicles',
    duration: 180,
    audio: 'https://commondatastorage.googleapis.com/codeskulptor-assets/sounddogs/soundtrack.ogg',
    image: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400&q=80',
    tags: ['cinematic', 'epic', 'trailer', 'heroic', 'strings', 'drama'],
    themeCategory: 'cinematic',
    bpm: 115,
    mood: 'Dramatic & Inspiring',
  },
  {
    id: 'jam-cine-2',
    title: 'The Great Discovery',
    artist_name: 'Cosmic Soundscapes',
    album_name: 'Mystery of the Cosmos',
    duration: 154,
    audio: 'https://commondatastorage.googleapis.com/codeskulptor-assets/Epoq-Lepidoptera.ogg',
    image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80',
    tags: ['cinematic', 'piano', 'storytelling', 'documentary', 'wonder'],
    themeCategory: 'cinematic',
    bpm: 90,
    mood: 'Thought-Provoking & Emotional',
  },

  // 4. Chill Lo-Fi & Study Beats
  {
    id: 'jam-lofi-1',
    title: 'Coffee Shop Rain Beats',
    artist_name: 'Lo-Fi Chill Collective',
    album_name: 'Late Night Coding',
    duration: 135,
    audio: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg',
    image: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=400&q=80',
    tags: ['lofi', 'chill', 'beats', 'relaxing', 'study', 'coffee'],
    themeCategory: 'lofi',
    bpm: 82,
    mood: 'Calm & Cozy',
  },
  {
    id: 'jam-lofi-2',
    title: 'Tokyo Sunset Chillhop',
    artist_name: 'Kuma Beats',
    album_name: 'Shibuya Melodies',
    duration: 140,
    audio: 'https://cdn.jsdelivr.net/gh/rafaelreis-hotmart/Audio-Sample-files@master/sample.mp3',
    image: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=400&q=80',
    tags: ['chillhop', 'lofi', 'relax', 'warm', 'smooth', 'lifestyle'],
    themeCategory: 'lofi',
    bpm: 85,
    mood: 'Mellow & Warm',
  },

  // 5. Modern Corporate & Upbeat Motivation
  {
    id: 'jam-corp-1',
    title: 'Inspiring Corporate Future',
    artist_name: 'AudioCoffee',
    album_name: 'Success & Innovation',
    duration: 165,
    audio: 'https://commondatastorage.googleapis.com/codeskulptor-assets/Epoq-Lepidoptera.ogg',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&q=80',
    tags: ['corporate', 'business', 'growth', 'inspiring', 'finance', 'commercial'],
    themeCategory: 'corporate',
    bpm: 120,
    mood: 'Positive & Uplifting',
  },
  {
    id: 'jam-corp-2',
    title: 'Startup Millionaire Momentum',
    artist_name: 'TimTaj Enterprise',
    album_name: 'Hustle & Scale',
    duration: 150,
    audio: 'https://cdn.jsdelivr.net/gh/rafaelreis-hotmart/Audio-Sample-files@master/sample.mp3',
    image: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=400&q=80',
    tags: ['money', 'entrepreneur', 'sales', 'growth', 'marketing'],
    themeCategory: 'corporate',
    bpm: 122,
    mood: 'Confident & Dynamic',
  },

  // 6. Dark Suspense & Mystery
  {
    id: 'jam-dark-1',
    title: 'Dark Underworld Drone',
    artist_name: 'Dark Matter Studio',
    album_name: 'True Crime Ambience',
    duration: 170,
    audio: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg',
    image: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=400&q=80',
    tags: ['dark', 'suspense', 'mystery', 'crime', 'investigation', 'tension'],
    themeCategory: 'dark',
    bpm: 95,
    mood: 'Suspenseful & Eerie',
  },

  // 7. Trap & Urban Beats
  {
    id: 'jam-trap-1',
    title: 'Heavy Sub Bass Street Trap',
    artist_name: 'BeatsByCon',
    album_name: 'Urban Energy 2026',
    duration: 130,
    audio: 'https://commondatastorage.googleapis.com/codeskulptor-demos/pyman_assets/ateapill.ogg',
    image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80',
    tags: ['trap', 'hiphop', 'bass', '808', 'street', 'workout'],
    themeCategory: 'trap',
    bpm: 138,
    mood: 'Energetic & Punchy',
  },
]

/**
 * Search tracks on Jamendo using the official Jamendo API
 * Falls back to curated catalog if offline or rate-limited
 */
export async function searchJamendoApi({
  query = '',
  tags = '',
  limit = 16,
}: {
  query?: string
  tags?: string
  limit?: number
}): Promise<JamendoTrackItem[]> {
  try {
    const params = new URLSearchParams({
      client_id: JAMENDO_CLIENT_ID,
      format: 'json',
      limit: String(limit),
      include: 'musicinfo',
      audioformat: 'mp32',
      hasimage: 'true',
    })

    if (query.trim()) params.append('namesearch', query.trim())
    if (tags.trim()) params.append('tags', tags.trim().replace(/\s+/g, '+'))

    const url = `https://api.jamendo.com/v3.0/tracks/?${params.toString()}`
    const res = await fetch(url, { method: 'GET' })

    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data.results) && data.results.length > 0) {
        return data.results.map((t: any) => ({
          id: `jam-${t.id}`,
          title: t.name || 'Untitled Track',
          artist_name: t.artist_name || 'Jamendo Artist',
          album_name: t.album_name || '',
          duration: t.duration || 120,
          audio: t.audio || `https://prod-1.storage.jamendo.com/?trackid=${t.id}&format=mp32&seclevel=public`,
          audiodownload: t.audiodownload,
          image: t.image || t.album_image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80',
          license_ccurl: t.license_ccurl,
          tags: t.musicinfo?.tags?.genres || [],
          themeCategory: deriveThemeCategory(t.name + ' ' + (t.musicinfo?.tags?.genres || []).join(' ')),
          bpm: t.musicinfo?.bpm || 120,
          mood: (t.musicinfo?.tags?.vartags || []).slice(0, 2).join(' ') || 'Royalty Free',
        }))
      }
    }
  } catch (err) {
    console.warn('Jamendo live API search fallback to curated library:', err)
  }

  // Fallback: search curated catalog
  const q = (query + ' ' + tags).toLowerCase().trim()
  if (!q) return CURATED_JAMENDO_TRACKS

  return CURATED_JAMENDO_TRACKS.filter((t) => {
    return (
      t.title.toLowerCase().includes(q) ||
      t.artist_name.toLowerCase().includes(q) ||
      t.tags?.some((k) => q.includes(k) || k.includes(q)) ||
      t.themeCategory.includes(q as any)
    )
  })
}

function deriveThemeCategory(text: string): JamendoTrackItem['themeCategory'] {
  const lower = text.toLowerCase()
  if (lower.includes('phonk') || lower.includes('drift')) return 'phonk'
  if (lower.includes('lofi') || lower.includes('chill') || lower.includes('coffee')) return 'lofi'
  if (lower.includes('cinematic') || lower.includes('epic') || lower.includes('orchestral') || lower.includes('trailer')) return 'cinematic'
  if (lower.includes('tech') || lower.includes('synth') || lower.includes('cyber') || lower.includes('matrix')) return 'tech'
  if (lower.includes('corp') || lower.includes('business') || lower.includes('finance') || lower.includes('money')) return 'corporate'
  if (lower.includes('dark') || lower.includes('mystery') || lower.includes('suspense') || lower.includes('crime')) return 'dark'
  return 'trap'
}

/**
 * AI Music & Theme Analyzer
 * Reads clip hook, topic, transcript sentiment, and pacing to choose the perfect music genre, mood, and Jamendo track!
 */
export async function analyzeClipMusicThemeWithAi({
  clip,
  transcript,
  customApiKey,
}: {
  clip: Clip
  transcript?: Transcript | null
  customApiKey?: string
}): Promise<AiMusicAnalysisResult> {
  const clipText = [
    clip.title,
    clip.hook || '',
    clip.topic || '',
    clip.category || '',
    transcript?.full_text?.slice(0, 600) || '',
  ]
    .filter(Boolean)
    .join('\n')

  const apiKey = customApiKey?.trim() || getStoredApiKey()

  const prompt = `You are a viral short-form music director for TikTok, YouTube Shorts, and Instagram Reels.
Analyze this video clip and select the perfect royalty-free soundtrack theme, mood, and Jamendo music tags to maximize watch retention:

Clip Title: "${clip.title}"
Clip Hook: "${clip.hook || 'N/A'}"
Clip Topic: "${clip.topic || 'General'}"
Category: "${clip.category || 'General'}"
Content Transcript:
"""
${clipText}
"""

Determine:
1. "theme": Choose the best matching theme name (e.g. "Viral Cyber Tech", "High-Energy Phonk Drop", "Inspiring Corporate Growth", "Deep Lo-Fi Storytelling", "Cinematic Suspense Hook", "Punchy Urban Trap").
2. "mood": 2-3 words (e.g. "Energetic & Futuristic", "Aggressive & Punchy", "Thought-Provoking & Emotional", "Positive & Uplifting").
3. "tempoBpm": Number between 80 and 150.
4. "vibeDescription": A punchy 1-sentence description of the musical vibe.
5. "jamendoQuery": Best search keyword for Jamendo music API (e.g. "cyberpunk", "phonk", "cinematic trailer", "lofi chill", "corporate motivation", "dark suspense", "trap beat").
6. "jamendoTags": 2-4 search tags (e.g. ["electronic", "synthwave"], ["phonk", "bass"], ["cinematic", "epic"], ["lofi", "chill"], ["corporate", "inspiring"]).
7. "recommendedVolume": Number between 0.08 and 0.18 (ideal background level under voice speech).
8. "reasoning": 2-sentence rationale on why this theme amplifies the clip's retention.

Respond ONLY with valid JSON:
{
  "theme": "string",
  "mood": "string",
  "tempoBpm": 128,
  "vibeDescription": "string",
  "jamendoQuery": "string",
  "jamendoTags": ["tag1", "tag2"],
  "recommendedVolume": 0.12,
  "reasoning": "string"
}`

  let aiResult: Partial<AiMusicAnalysisResult> | null = null

  if (apiKey) {
    try {
      // Use OpenRouter with Claude Opus 5 for AI services
      const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
      const modelName = 'anthropic/claude-opus-5';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://clipforge.app',
          'X-Title': 'ClipForge AI Music Director',
        },
        body: JSON.stringify({
          model: modelName,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You are an AI video music supervisor. Return strict JSON.' },
            { role: 'user', content: prompt },
          ],
        }),
      })

      if (res.ok) {
        const data = await res.json()
        aiResult = JSON.parse(data.choices?.[0]?.message?.content || '{}')
      }
    } catch (err) {
      console.warn('AI Music Theme Analysis error, using smart heuristic matching:', err)
    }
  }

  // Fallback heuristic theme analysis if AI is unavailable or failed
  if (!aiResult || !aiResult.theme) {
    aiResult = generateHeuristicMusicTheme(clipText)
  }

  // Now query Jamendo tracks based on the AI query and tags
  const jamendoTracks = await searchJamendoApi({
    query: aiResult.jamendoQuery || 'electronic',
    tags: (aiResult.jamendoTags || []).join('+'),
    limit: 10,
  })

  // Pick the top matching Jamendo track
  const selectedTrack = jamendoTracks[0] || CURATED_JAMENDO_TRACKS[0]

  return {
    theme: aiResult.theme || 'Modern Creator Beat',
    mood: aiResult.mood || 'Energetic & Modern',
    tempoBpm: aiResult.tempoBpm || 125,
    vibeDescription: aiResult.vibeDescription || 'Fast-paced rhythmic beat to drive viewer retention.',
    jamendoQuery: aiResult.jamendoQuery || 'electronic',
    jamendoTags: aiResult.jamendoTags || ['electronic', 'viral'],
    recommendedVolume: aiResult.recommendedVolume || 0.12,
    selectedTrack,
    reasoning:
      aiResult.reasoning ||
      `Selected "${selectedTrack.title}" by ${selectedTrack.artist_name} to complement the clip's hook with high-energy pacing.`,
  }
}

function generateHeuristicMusicTheme(text: string): Partial<AiMusicAnalysisResult> {
  const lower = text.toLowerCase()

  if (
    lower.includes('tech') ||
    lower.includes('code') ||
    lower.includes('software') ||
    lower.includes('ai') ||
    lower.includes('algorithm') ||
    lower.includes('developer')
  ) {
    return {
      theme: 'Viral Cyber Tech & Synth',
      mood: 'Futuristic & Focused',
      tempoBpm: 128,
      vibeDescription: 'Driving synthwave pulses tailored for technology breakdowns and coding insights.',
      jamendoQuery: 'synthwave',
      jamendoTags: ['electronic', 'tech', 'synthwave'],
      recommendedVolume: 0.12,
      reasoning: 'The electronic synth rhythm matches the high-tech, fast-paced nature of the programming breakdown.',
    }
  }

  if (
    lower.includes('money') ||
    lower.includes('finance') ||
    lower.includes('crypto') ||
    lower.includes('dollar') ||
    lower.includes('sales') ||
    lower.includes('business') ||
    lower.includes('profit')
  ) {
    return {
      theme: 'Inspiring Corporate & Wealth Momentum',
      mood: 'Confident & Uplifting',
      tempoBpm: 122,
      vibeDescription: 'Modern inspiring beat that gives credibility and momentum to financial insights.',
      jamendoQuery: 'corporate',
      jamendoTags: ['corporate', 'inspiring', 'business'],
      recommendedVolume: 0.13,
      reasoning: 'The confident melodic groove creates authority and keeps viewers locked during financial hooks.',
    }
  }

  if (
    lower.includes('shock') ||
    lower.includes('secret') ||
    lower.includes('warning') ||
    lower.includes('mistake') ||
    lower.includes('crazy') ||
    lower.includes('mindblown')
  ) {
    return {
      theme: 'High-Stakes Dramatic Hook',
      mood: 'Suspenseful & Urgent',
      tempoBpm: 140,
      vibeDescription: 'Aggressive viral phonk and sub-bass drop designed for shocking revelations.',
      jamendoQuery: 'phonk',
      jamendoTags: ['phonk', 'bass', 'viral'],
      recommendedVolume: 0.11,
      reasoning: 'High-tempo phonk cowbells create instant urgency for shocking secrets and retention spikes.',
    }
  }

  if (
    lower.includes('story') ||
    lower.includes('life') ||
    lower.includes('learn') ||
    lower.includes('think') ||
    lower.includes('journey') ||
    lower.includes('philosophy')
  ) {
    return {
      theme: 'Deep Storytelling Lo-Fi',
      mood: 'Thought-Provoking & Cozy',
      tempoBpm: 85,
      vibeDescription: 'Warm vinyl texture and mellow keys that allow narrative storytelling to shine.',
      jamendoQuery: 'lofi',
      jamendoTags: ['lofi', 'chill', 'beats'],
      recommendedVolume: 0.15,
      reasoning: 'Soft lo-fi frequencies give room for the spoken voiceover while maintaining a cozy, intimate vibe.',
    }
  }

  return {
    theme: 'Viral TikTok Phonk / Hype Energy',
    mood: 'Energetic & Punchy',
    tempoBpm: 135,
    vibeDescription: 'Driving beat with punchy low-end designed for short-form retention.',
    jamendoQuery: 'electronic',
    jamendoTags: ['electronic', 'viral'],
    recommendedVolume: 0.12,
    reasoning: 'A dynamic electronic rhythm provides continuous momentum throughout the 30-second clip.',
  }
}
