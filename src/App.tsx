// ============================================================
// Telepathy - App Root
// ============================================================

import { SearchBar } from './components/SearchBar/SearchBar'
import { TabBar } from './components/TabBar/TabBar'
import { MainLayout } from './components/Layout/Layout'
import { useAppStore } from './stores/appStore'
import { useEffect } from 'react'
import './styles/global.css'
import './App.css'

export function App() {
  const { navBackStack, navForwardStack, goBack, goForward, createTab, closeTab, activeTabId } = useAppStore()

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Alt+Left / Alt+Right for navigation
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        goBack()
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        goForward()
      }
      // Ctrl+T for new tab
      else if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault()
        createTab()
      }
      // Ctrl+W for close tab
      else if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault()
        if (activeTabId) closeTab(activeTabId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goBack, goForward, createTab, closeTab, activeTabId])

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-logo">&#x1F9E0;</span>
          Telepathy
        </div>
        <div className="nav-buttons">
          <button
            className="nav-btn"
            onClick={goBack}
            disabled={navBackStack.length === 0}
            title="Go back (Alt+Left)"
          >
            &#x2190;
          </button>
          <button
            className="nav-btn"
            onClick={goForward}
            disabled={navForwardStack.length === 0}
            title="Go forward (Alt+Right)"
          >
            &#x2192;
          </button>
        </div>
        <SearchBar />
        <div className="header-spacer" />
      </header>
      <TabBar />
      <MainLayout />
    </div>
  )
}
