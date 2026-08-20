import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { isSupabaseConfigured } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import CreateProject from '@/pages/CreateProject'
import Projects from '@/pages/Projects'
import ProjectDetail from '@/pages/ProjectDetail'
import Clips from '@/pages/Clips'
import ClipStudio from '@/pages/ClipStudio'
import CalendarPage from '@/pages/CalendarPage'
import MediaLibrary from '@/pages/MediaLibrary'
import AIPage from '@/pages/AIPage'
import PatternLibrary from '@/pages/PatternLibrary'
import CSVImport from '@/pages/CSVImport'
import Analytics from '@/pages/Analytics'
import SettingsPage from '@/pages/SettingsPage'

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-neutral-200">
        <div className="max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 p-8">
          <h1 className="mb-3 text-xl font-semibold text-orange-500">ClipForge AI is not configured</h1>
          <p className="mb-4 text-sm leading-relaxed">
            Missing Supabase environment variables. Set{' '}
            <code className="rounded bg-neutral-800 px-1">VITE_SUPABASE_URL</code> and{' '}
            <code className="rounded bg-neutral-800 px-1">VITE_SUPABASE_ANON_KEY</code> in your
            hosting provider (or a local <code className="rounded bg-neutral-800 px-1">.env</code>),
            then rebuild/redeploy the app.
          </p>
          <p className="text-xs text-neutral-400">
            Find both values in your Supabase dashboard under Project Settings → API.
          </p>
        </div>
      </div>
    )
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/create" element={<CreateProject />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:projectId" element={<ProjectDetail />} />
              <Route path="/clips" element={<Clips />} />
              <Route path="/clips/:clipId/studio" element={<ClipStudio />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/media" element={<MediaLibrary />} />
              <Route path="/ai" element={<AIPage />} />
              <Route path="/patterns" element={<PatternLibrary />} />
              <Route path="/csv-import" element={<CSVImport />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
