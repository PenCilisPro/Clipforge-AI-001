import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Shield, Lock, Eye, FileText, CheckCircle, RefreshCw, Copy, Check } from 'lucide-react'
import { PageHeader } from '@/components/ui'

export default function PrivacyPolicy() {
  const [copied, setCopied] = useState(false)
  const lastUpdated = 'August 20, 2026'

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <Link to="/" className="btn-ghost !px-2.5 text-xs">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
        <button
          onClick={handleCopy}
          className="btn-secondary !py-1.5 !px-3 text-xs"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Link Copied' : 'Share Policy'}
        </button>
      </div>

      <PageHeader
        title="Privacy Policy"
        subtitle={`Last Updated: ${lastUpdated} · ClipForge AI Data Protection & Privacy Governance`}
      />

      {/* Trust & Highlights Banner */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4 bg-surface-900 border-surface-800 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-100">Zero Model Training</h4>
            <p className="mt-1 text-xs text-zinc-400">
              Your uploaded video, voice recordings, and transcripts are never used to train public AI models.
            </p>
          </div>
        </div>

        <div className="card p-4 bg-surface-900 border-surface-800 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-100">Encrypted in Transit</h4>
            <p className="mt-1 text-xs text-zinc-400">
              All video streams, rendered short clips, and API payloads use TLS 1.3 enterprise encryption.
            </p>
          </div>
        </div>

        <div className="card p-4 bg-surface-900 border-surface-800 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Eye className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-100">User Data Control</h4>
            <p className="mt-1 text-xs text-zinc-400">
              Full control to export, purge clips, revoke OAuth permissions, or delete your entire workspace at any time.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Sections */}
      <div className="card p-6 md:p-8 space-y-8 bg-surface-900 border-surface-800 text-zinc-300 leading-relaxed text-sm">
        <section className="space-y-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FileText className="h-4 w-4 text-brand-400" /> 1. Overview and Scope
          </h2>
          <p>
            Welcome to <strong>ClipForge AI</strong> (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;). This Privacy Policy governs how ClipForge AI collects, processes, stores, and protects data when you use our video clipping, transcription, subtitle generation, Remotion composition rendering, and social scheduling platform.
          </p>
          <p>
            By accessing or using ClipForge AI, you acknowledge that you have read and understood this Privacy Policy. If you do not agree with our practices, please discontinue use of our services.
          </p>
        </section>

        <section className="space-y-3 border-t border-surface-800 pt-6">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Shield className="h-4 w-4 text-brand-400" /> 2. Information We Collect
          </h2>
          <p>We collect information you provide directly and metadata generated during video processing:</p>
          <ul className="list-disc pl-5 space-y-2 text-zinc-300">
            <li>
              <strong>Account & Profile Details:</strong> Email address, workspace identifier, and encrypted authentication tokens.
            </li>
            <li>
              <strong>Video & Audio Media:</strong> Source video files, YouTube URLs, audio streams, transcript timestamps, and rendered MP4 short clips.
            </li>
            <li>
              <strong>AI Captions & Pattern Data:</strong> Generated transcript words, speech timestamps, customized hook captions, viral pattern templates, and styling preferences.
            </li>
            <li>
              <strong>Connected Social Accounts:</strong> YouTube and TikTok OAuth scopes strictly authorized to schedule and upload short-form video content on your behalf.
            </li>
            <li>
              <strong>Custom API Keys:</strong> Custom OpenAI Whisper or Gemini API keys entered locally in your browser to process video requests.
            </li>
          </ul>
        </section>

        <section className="space-y-3 border-t border-surface-800 pt-6">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Lock className="h-4 w-4 text-brand-400" /> 3. How We Use and Process Data
          </h2>
          <p>We use your information exclusively to provide and enhance our core application features:</p>
          <div className="grid gap-3 sm:grid-cols-2 pt-2">
            <div className="rounded-lg bg-surface-850 p-3 border border-surface-750">
              <h4 className="font-semibold text-zinc-100 text-xs flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Remotion Video Rendering
              </h4>
              <p className="mt-1 text-xs text-zinc-400">
                To crop 9:16 vertical shorts, synchronize animated karaoke subtitles, and blend stock B-Roll video layers.
              </p>
            </div>
            <div className="rounded-lg bg-surface-850 p-3 border border-surface-750">
              <h4 className="font-semibold text-zinc-100 text-xs flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> AI Speech Transcription
              </h4>
              <p className="mt-1 text-xs text-zinc-400">
                To transcribe speech into word-level timestamps using Whisper and detect high-retention viral moments.
              </p>
            </div>
            <div className="rounded-lg bg-surface-850 p-3 border border-surface-750">
              <h4 className="font-semibold text-zinc-100 text-xs flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Automated Publishing
              </h4>
              <p className="mt-1 text-xs text-zinc-400">
                To publish scheduled Shorts and TikTok reels directly to your linked creator accounts per your schedule.
              </p>
            </div>
            <div className="rounded-lg bg-surface-850 p-3 border border-surface-750">
              <h4 className="font-semibold text-zinc-100 text-xs flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Analytics & Engagement
              </h4>
              <p className="mt-1 text-xs text-zinc-400">
                To calculate clip retention scores, view counts, and pattern effectiveness across your library.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3 border-t border-surface-800 pt-6">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-brand-400" /> 4. AI & Third-Party Service Providers
          </h2>
          <p>
            To deliver AI transcription and stock media capabilities, we interface with trusted industry providers under strict data privacy agreements:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-zinc-300">
            <li><strong>OpenAI / Whisper:</strong> For high-accuracy word-level audio speech recognition.</li>
            <li><strong>Supabase / PostgreSQL:</strong> For encrypted database storage, authentication, and secure video storage buckets.</li>
            <li><strong>Stock Media Providers (Pexels, Unsplash, Jamendo):</strong> For royalty-free B-roll and background music previews.</li>
            <li><strong>Google / YouTube API Services:</strong> Governed by Google's Privacy Policy at <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-400 underline">policies.google.com/privacy</a>.</li>
          </ul>
        </section>

        <section className="space-y-3 border-t border-surface-800 pt-6">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Eye className="h-4 w-4 text-brand-400" /> 5. Data Retention & Deletion Rights
          </h2>
          <p>
            You retain complete ownership over all source footage and generated clips. You may at any time:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-zinc-300">
            <li>Delete individual video projects, clips, or rendered versions permanently.</li>
            <li>Disconnect third-party social media integrations via the Settings tab.</li>
            <li>Request a complete purge of your account data and all associated media records by contacting support.</li>
          </ul>
        </section>

        <section className="space-y-3 border-t border-surface-800 pt-6">
          <h2 className="text-base font-bold text-white">6. Contact Information</h2>
          <p>
            If you have questions regarding this Privacy Policy, your data rights, or our security protocols, please reach out to our privacy team at:
          </p>
          <div className="rounded-lg bg-surface-850 p-4 border border-surface-750 text-xs space-y-1">
            <p className="font-semibold text-zinc-200">ClipForge AI Security & Privacy Office</p>
            <p className="text-zinc-400">Email: <span className="text-brand-400 font-mono">privacy@clipforge.app</span></p>
            <p className="text-zinc-400">Workspace Support: In-app Settings & Help Desk</p>
          </div>
        </section>
      </div>
    </div>
  )
}
