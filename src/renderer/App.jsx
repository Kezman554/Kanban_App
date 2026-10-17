import React, { useState, useEffect } from 'react';
import CurrentProjectPage from './pages/CurrentProjectPage';
import AllProjectsView from './pages/AllProjectsView';
import RoadmapPage from './pages/RoadmapPage';
import SettingsPage from './pages/SettingsPage';
import CardTestPage from './pages/CardTestPage';
import ImportDialog from './components/ImportDialog';
import { ClipboardList, LayoutGrid, MapIcon, FlaskConical, SettingsIcon, ChevronsLeft, ChevronsRight, Plus } from './components/icons';
import { paletteFor } from './utils/palette';
import { BUILD_LABEL } from './utils/buildInfo';

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
    { id: 'current-project', label: 'Current Project', Icon: ClipboardList },
    { id: 'all-projects', label: 'All Projects', Icon: LayoutGrid },
    { id: 'roadmap', label: 'Roadmap', Icon: MapIcon },
    { id: 'card-test', label: 'Card Test', Icon: FlaskConical },
    { id: 'settings', label: 'Settings', Icon: SettingsIcon }
  ];

  return (
    <>
    <div className="flex h-screen bg-page text-ink">
      {/* Sidebar */}
      <aside className={`${sidebarCollapsed ? 'w-14' : 'w-64'} bg-sidebar border-r border-divider flex flex-col transition-all duration-200`}>
        {/* Sidebar Header */}
        {/* Expanded: this section takes the free height so the project list can
            grow, and the navigation and footer sit at the bottom */}
        <div className={`p-4 border-b border-divider ${sidebarCollapsed ? '' : 'flex-1 min-h-0 flex flex-col'}`}>
          <div className="flex-shrink-0 flex items-center justify-between mb-3">
            {!sidebarCollapsed && <h1 className="text-xl font-bold">Kanban Manager</h1>}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={`p-1.5 rounded-lg text-muted hover:text-ink hover:bg-hover transition-colors ${sidebarCollapsed ? 'mx-auto' : ''}`}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <ChevronsRight className="w-5 h-5" /> : <ChevronsLeft className="w-5 h-5" />}
            </button>
          </div>

          {!sidebarCollapsed && (
            <>
              {/* Project list: each project's dot is palette[project.id mod 12] */}
              <div className="relative min-h-0 flex flex-col">
                <h2 id="project-list-label" className="block text-xs text-muted mb-1">
                  Current Project
                </h2>
                {loading ? (
                  <div className="w-full px-3 py-2 text-sm text-muted">
                    Loading...
                  </div>
                ) : projects.length === 0 ? (
                  <div className="w-full px-3 py-2 text-sm text-muted">No projects yet</div>
                ) : (
                  <ul
                    aria-labelledby="project-list-label"
                    className="min-h-0 overflow-y-auto scrollbar-themed -mx-1 px-1 pb-1 space-y-0.5"
                  >
                    {projects.map((project) => {
                      const isSelected = project.id === selectedProject;
                      return (
                        <li key={project.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedProject(project.id)}
                            aria-current={isSelected ? 'true' : undefined}
                            className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-sm transition-colors ${
                              isSelected
                                ? 'bg-page border-[1.5px] border-line shadow-card font-semibold text-ink'
                                : 'border-[1.5px] border-transparent text-ink hover:bg-hover'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className="flex-shrink-0 w-3 h-3 rounded-full border-[1.5px] border-card-line"
                              style={{ backgroundColor: paletteFor(project.id).fill }}
                            />
                            <span className="truncate">{project.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Import Project Button */}
              <button
                onClick={() => setIsImportDialogOpen(true)}
                className="flex-shrink-0 w-full mt-3 px-3 py-2 bg-pal-apricot border-[1.5px] border-card-line shadow-card rounded-lg text-sm font-semibold text-card-ink hover:brightness-95 transition flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Import Project</span>
              </button>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className={`${sidebarCollapsed ? 'flex-1' : 'flex-shrink-0'} p-4 space-y-1`}>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`w-full flex items-center rounded-lg text-left transition-colors ${
                sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2'
              } ${
                currentPage === item.id
                  ? 'bg-nav-active text-card-ink border-[1.5px] border-card-line font-semibold'
                  : 'border-[1.5px] border-transparent text-ink hover:bg-hover'
              }`}
              title={sidebarCollapsed ? item.label : undefined}
              aria-label={sidebarCollapsed ? item.label : undefined}
              aria-current={currentPage === item.id ? 'page' : undefined}
            >
              <item.Icon className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span className="text-sm font-medium">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Sidebar Footer */}
        {!sidebarCollapsed && (
          <div className="p-4 border-t border-divider">
            <p className="text-xs text-muted">
              Kanban Manager {BUILD_LABEL}
            </p>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto scrollbar-themed">
        {renderPage()}
      </main>
    </div>

    {/* Import Dialog */}
    <ImportDialog
      isOpen={isImportDialogOpen}
      onClose={() => setIsImportDialogOpen(false)}
      onImportSuccess={loadProjects}
    />
    </>
  );
}

export default App;
