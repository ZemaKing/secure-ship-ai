import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar/Sidebar'
import ChatWindow from './components/ChatWindow/ChatWindow'
import ProtectedRoute from './auth/ProtectedRoute'
import AdminLayout from './admin/AdminLayout'
import Dashboard from './admin/Dashboard/Dashboard'
import CustomerManager from './admin/CustomerManager/CustomerManager'
import ShipmentManager from './admin/ShipmentManager/ShipmentManager'
import PackageManager from './admin/PackageManager/PackageManager'
import './App.scss'

function ChatLayout() {
  const [sessionKey, setSessionKey] = useState(0)

  return (
    <div className="app-layout">
      <Sidebar onNewChat={() => setSessionKey((key) => key + 1)} />
      <ChatWindow key={sessionKey} />
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<ChatLayout />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="customers" element={<CustomerManager />} />
        <Route path="shipments" element={<ShipmentManager />} />
        <Route path="packages" element={<PackageManager />} />
      </Route>
    </Routes>
  )
}

export default App
