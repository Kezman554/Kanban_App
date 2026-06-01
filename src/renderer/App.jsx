import React, { useState, useEffect } from 'react';
import CurrentProjectPage from './pages/CurrentProjectPage';
import AllProjectsView from './pages/AllProjectsView';
import RoadmapPage from './pages/RoadmapPage';
import SettingsPage from './pages/SettingsPage';
import CardTestPage from './pages/CardTestPage';
import ImportDialog from './components/ImportDialog';
import { TerminalSessionProvider } from './contexts/TerminalSessionContext.jsx';

function App() {
  const [currentPage, setCurrentPage] = useState('current-project');
  const [selectedProject, setSelectedProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const allProjects = await window.electron.getAllProjects();
      setProjects(allProjects);

      // Check if currently selected project still exists
      const selectedStillExists = allProjects.some(p => p.id === selectedProject);

      if (allProjects.length > 0 && (!selectedProject || !selectedStillExists)) {
        // Auto-select first project if none selected or selected was deleted
        setSelectedProject(allProjects[0].id);
      } else if (allProjects.length === 0) {
        // No projects left, clear selection
        setSelectedProject(null);
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to load projects:', error);
      setLoading(false);
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'current-project':
        return <CurrentProjectPage selectedProjectId={selectedProject} />;
      case 'all-projects':
        return <AllProjectsView />;
      case 'roadmap':
        return <RoadmapPage selectedProjectId={selectedProject} />;
      case 'settings':
        return <SettingsPage onProjectsChange={loadProjects} />;
      case 'card-test':
        return <CardTestPage />;
      default:
        return <CurrentProjectPage selectedProjectId={selectedProject} />;
    }
  };

  const navItems = [
    { id: 'current-project', label: 'Current Project', icon: '📋' },
    { id: 'all-projects', label: 'All Projects', icon: '📑' },
    { id: 'roadmap', label: 'Roadmap', icon: '🗺️' },
    { id: 'card-test', label: 'Card Test', icon: '🧪' },
    { id: 'settings', label: 'Settings', icon: '⚙️' }
  ];

  return (
    <TerminalSessionProvider>
    <div className="flex h-screen bg-dark-bg text-dark-text">
      {/* Sidebar */}
      <aside className={`${sidebarCollapsed ? 'w-14' : 'w-64'} bg-dark-surface border-r border-dark-border flex flex-col transition-all duration-200`}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-dark-border">
          <div className="flex items-center justify-between mb-3">
            {!sidebarCollapsed && <h1 className="text-xl font-bold">Kanban Manager</h1>}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={`p-1.5 rounded-lg text-dark-text-secondary hover:text-dark-text hover:bg-dark-hover transition-colors ${sidebarCollapsed ? 'mx-auto' : ''}`}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {sidebarCollapsed ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                )}
              </svg>
            </button>
          </div>

          {!sidebarCollapsed && (
            <>
              {/* Project Selector Dropdown */}
              <div className="relative">
                <label className="block text-xs text-dark-text-secondary mb-1">
                  Current Project
                </label>
                {loading ? (
                  <div className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-dark-text-secondary">
                    Loading...
                  </div>
                ) : (
                  <select
                    value={selectedProject || ''}
                    onChange={(e) => setSelectedProject(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">Select a project...</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Import Project Button */}
              <button
                onClick={() => setIsImportDialogOpen(true)}
                className="w-full mt-3 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-dark-text hover:border-blue-500 hover:text-blue-400 transition-colors flex items-center justify-center gap-2"
              >
                <span>+</span>
                <span>Import Project</span>
              </button>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`w-full flex items-center rounded-lg text-left transition-colors ${
                sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2'
              } ${
                currentPage === item.id
                  ? 'bg-blue-600 text-white'
                  : 'text-dark-text hover:bg-dark-hover'
              }`}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <span className="text-xl">{item.icon}</span>
              {!sidebarCollapsed && <span className="text-sm font-medium">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Sidebar Footer */}
        {!sidebarCollapsed && (
          <div className="p-4 border-t border-dark-border">
            <p className="text-xs text-dark-text-secondary">
              Kanban Manager v1.0.0
            </p>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto scrollbar-dark">
        {renderPage()}
      </main>
    </div>

    {/* Import Dialog */}
    <ImportDialog
      isOpen={isImportDialogOpen}
      onClose={() => setIsImportDialogOpen(false)}
      onImportSuccess={loadProjects}
    />
    </TerminalSessionProvider>
  );
}

export default App;
