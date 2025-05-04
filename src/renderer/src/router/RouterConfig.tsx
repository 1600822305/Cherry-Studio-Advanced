import Sidebar from '@renderer/components/app/Sidebar'
import NavigationHandler from '@renderer/handler/NavigationHandler'
import AgentsPage from '@renderer/pages/agents/AgentsPage'
import AppsPage from '@renderer/pages/apps/AppsPage'
import Browser from '@renderer/pages/Browser'
import CalendarPage from '@renderer/pages/calendar'
import DeepResearchPage from '@renderer/pages/deepresearch/DeepResearchPage'
import FilesPage from '@renderer/pages/files/FilesPage'
import HomePage from '@renderer/pages/home/HomePage'
import KnowledgePage from '@renderer/pages/knowledge/KnowledgePage'
import PaintingsPage from '@renderer/pages/paintings/PaintingsPage'
import SettingsPage from '@renderer/pages/settings/SettingsPage'
import TranslatePage from '@renderer/pages/translate/TranslatePage'
import WorkspacePage from '@renderer/pages/workspace'
import { createHashRouter, HashRouter, Route, Routes } from 'react-router-dom'

// 添加React Router v7的未来标志
export const router = createHashRouter(
  [
    {
      path: '/',
      element: <HomePage />
    },
    {
      path: '/agents',
      element: <AgentsPage />
    },
    {
      path: '/paintings',
      element: <PaintingsPage />
    },
    {
      path: '/translate',
      element: <TranslatePage />
    },
    {
      path: '/files',
      element: <FilesPage />
    },
    {
      path: '/knowledge',
      element: <KnowledgePage />
    },
    {
      path: '/apps',
      element: <AppsPage />
    },
    {
      path: '/workspace',
      element: <WorkspacePage />
    },
    {
      path: '/deepresearch',
      element: <DeepResearchPage />
    },
    {
      path: '/browser',
      element: <Browser />
    },
    {
      path: '/calendar',
      element: <CalendarPage />
    },
    {
      path: '/settings/*',
      element: <SettingsPage />
    }
  ],
  {
    // 添加React Router v7的未来标志
    future: {
      // @ts-ignore - v7_startTransition 在当前类型定义中不存在，但在新版本中可能存在
      v7_startTransition: true,
      v7_relativeSplatPath: true
    }
  }
)

// 兼容现有的HashRouter实现
export const RouterComponent = ({ children }: { children?: React.ReactNode }) => {
  return (
    <HashRouter
      future={{
        // @ts-ignore - v7_startTransition 在当前类型定义中不存在，但在新版本中可能存在
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}>
      <NavigationHandler />
      <Sidebar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/paintings" element={<PaintingsPage />} />
        <Route path="/translate" element={<TranslatePage />} />
        <Route path="/files" element={<FilesPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route path="/deepresearch" element={<DeepResearchPage />} />
        <Route path="/browser" element={<Browser />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/settings/*" element={<SettingsPage />} />
      </Routes>
      {children}
    </HashRouter>
  )
}

export default RouterComponent
