import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar/Sidebar'
import ChatWindow from './components/ChatWindow/ChatWindow'
import ProtectedRoute from './auth/ProtectedRoute'
import AdminLayout from './admin/AdminLayout'
import CustomerManager from './admin/CustomerManager/CustomerManager'
import ShipmentManager from './admin/ShipmentManager/ShipmentManager'
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
        <Route index element={<Navigate to="customers" replace />} />
        <Route path="customers" element={<CustomerManager />} />
        <Route path="shipments" element={<ShipmentManager />} />
      </Route>
    </Routes>
  )
}

export default App
