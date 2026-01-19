import React, { useState } from 'react';
import ProjectsPage from './pages/ProjectsPage';
import CurrentProjectPage from './pages/CurrentProjectPage';
import RoadmapPage from './pages/RoadmapPage';
import SettingsPage from './pages/SettingsPage';
import CardTestPage from './pages/CardTestPage';

function App() {
  const [currentPage, setCurrentPage] = useState('current-project');
  const [selectedProject, setSelectedProject] = useState(null);

  // Mock project data - will be replaced with real data later
  const projects = [
    { id: 1, name: 'Kanban App' },
    { id: 2, name: 'Sample Project' }
  ];

  const renderPage = () => {
    switch (currentPage) {
      case 'projects':
        return <ProjectsPage />;
      case 'current-project':
        return <CurrentProjectPage />;
      case 'roadmap':
        return <RoadmapPage />;
      case 'settings':
        return <SettingsPage />;
      case 'card-test':
        return <CardTestPage />;
      default:
        return <CurrentProjectPage />;
    }
  };

  const navItems = [
    { id: 'projects', label: 'Projects', icon: '📊' },
    { id: 'current-project', label: 'Current Project', icon: '📋' },
    { id: 'roadmap', label: 'Roadmap', icon: '🗺️' },
    { id: 'card-test', label: 'Card Test', icon: '🧪' },
    { id: 'settings', label: 'Settings', icon: '⚙️' }
  ];

  return (
    <div className="flex h-screen bg-dark-bg text-dark-text">
      {/* Sidebar */}
      <aside className="w-64 bg-dark-surface border-r border-dark-border flex flex-col">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-dark-border">
          <h1 className="text-xl font-bold mb-3">Kanban Manager</h1>

          {/* Project Selector Dropdown */}
          <div className="relative">
            <label className="block text-xs text-dark-text-secondary mb-1">
              Current Project
            </label>
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
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                currentPage === item.id
                  ? 'bg-blue-600 text-white'
                  : 'text-dark-text hover:bg-dark-hover'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-dark-border">
          <p className="text-xs text-dark-text-secondary">
            Kanban Manager v1.0.0
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto scrollbar-dark">
        {renderPage()}
      </main>
    </div>
  );
}

export default App;
