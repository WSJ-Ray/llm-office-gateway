import { Routes, Route } from 'react-router-dom'
import TokenGate from './components/TokenGate'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Providers from './pages/Providers'
import Mappings from './pages/Mappings'
import Logs from './pages/Logs'

export default function App() {
  return (
    <TokenGate>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/providers" element={<Providers />} />
          <Route path="/mappings" element={<Mappings />} />
          <Route path="/logs" element={<Logs />} />
        </Route>
      </Routes>
    </TokenGate>
  )
}
