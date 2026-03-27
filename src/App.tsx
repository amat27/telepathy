// ============================================================
// Telepathy - App Root
// ============================================================

import { SearchBar } from './components/SearchBar/SearchBar'
import { TabBar } from './components/TabBar/TabBar'
import { CallstackDialog } from './components/CallstackDialog/CallstackDialog'
import { ThemeMenu } from './components/ThemeMenu/ThemeMenu'
import { MainLayout } from './components/Layout/Layout'
import { useAppStore } from './stores/appStore'
import { useTheme } from './hooks/useTheme'
import { useEffect, useState } from 'react'
import './styles/global.css'
import './App.css'

export function App() {
  const { navBackStack, navForwardStack, goBack, goForward, createTab, closeTab, activeTabId, saveOrUpdateView, sessionError, dismissSessionError } = useAppStore()
  const [showCallstack, setShowCallstack] = useState(false)
  const { themeId, setThemeId } = useTheme()

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
      // Ctrl+S for save/update view
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 's') {
        e.preventDefault()
        saveOrUpdateView()
      }
      // Ctrl+Shift+V for callstack dialog
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
        e.preventDefault()
        setShowCallstack(prev => !prev)
      }
      // Ctrl+Plus / Ctrl+= for zoom in
      else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        window.telepathy?.zoomIn()
      }
      // Ctrl+Minus for zoom out
      else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault()
        window.telepathy?.zoomOut()
      }
      // Ctrl+0 for zoom reset
      else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        window.telepathy?.zoomReset()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goBack, goForward, createTab, closeTab, activeTabId, saveOrUpdateView])

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
        <button
          className="nav-btn"
          onClick={() => setShowCallstack(true)}
          title="Load callstack (Ctrl+Shift+V)"
        >
          &#x2630;
        </button>
        <ThemeMenu currentThemeId={themeId} onSelect={setThemeId} />
      </header>
      <TabBar />
      {sessionError && (
        <div className="session-error-banner">
          <span className="session-error-text">{sessionError}</span>
          <button className="session-error-dismiss" onClick={dismissSessionError} title="Dismiss">
            &times;
          </button>
        </div>
      )}
      <MainLayout />
      <CallstackDialog open={showCallstack} onClose={() => setShowCallstack(false)} />
    </div>
  )
}
