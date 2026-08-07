import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar/Sidebar'
import ChatWindow from './components/ChatWindow/ChatWindow'
import ProtectedRoute from './auth/ProtectedRoute'
import AdminApp from './admin/AdminApp'
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
        path="/admin/*"
        element={
          <ProtectedRoute>
            <AdminApp />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default App
