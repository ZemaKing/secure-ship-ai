import { useState } from 'react'
import Sidebar from './components/Sidebar/Sidebar'
import ChatWindow from './components/ChatWindow/ChatWindow'
import './App.scss'

function App() {
  const [sessionKey, setSessionKey] = useState(0)

  return (
    <div className="app-layout">
      <Sidebar onNewChat={() => setSessionKey((key) => key + 1)} />
      <ChatWindow key={sessionKey} />
    </div>
  )
}

export default App
