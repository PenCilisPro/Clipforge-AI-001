import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
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
