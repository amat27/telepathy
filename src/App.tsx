// ============================================================
// Telepathy - App Root
// ============================================================

import { SearchBar } from './components/SearchBar/SearchBar'
import { MainLayout } from './components/Layout/Layout'
import './styles/global.css'
import './App.css'

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-logo">&#x1F9E0;</span>
          Telepathy
        </div>
        <SearchBar />
        <div className="header-spacer" />
      </header>
      <MainLayout />
    </div>
  )
}
