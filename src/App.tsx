import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { RequireAuth } from '@/auth/RequireAuth'
import Login from '@/routes/Login'
import Armadio from '@/routes/Armadio'
import Outfit from '@/routes/Outfit'
import Profilo from '@/routes/Profilo'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        {/* dentro RequireAuth: aspetta che Supabase legga il token del magic link dall'URL */}
        <Route index element={<Navigate to="/armadio" replace />} />
        <Route element={<AppShell />}>
          <Route path="/armadio" element={<Armadio />} />
          <Route path="/outfit" element={<Outfit />} />
          <Route path="/profilo" element={<Profilo />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/armadio" replace />} />
    </Routes>
  )
}
