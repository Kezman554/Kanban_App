import React, { useState } from 'react';
import { FolderOpen } from './icons';

const ImportDialog = ({ isOpen, onClose, onImportSuccess }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);

  const handleSelectFile = async () => {
    try {
      setError(null);
      const result = await window.electron.openJsonFile();

      if (!result) {
        // User cancelled
        return;
      }

      setSelectedFile(result.filePath);
      setFileData(result.data);
    } catch (err) {
      setError(err.message || 'Failed to read file');
      setSelectedFile(null);
      setFileData(null);
    }
  };

  const handleImport = async () => {
    if (!fileData) return;

    try {
      setImporting(true);
      setError(null);

      await window.electron.importProjectFromJson(fileData);

      // Success - close dialog and notify parent
      if (onImportSuccess) {
        onImportSuccess();
      }
      handleClose();
    } catch (err) {
      setError(err.message || 'Failed to import project');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setFileData(null);
    setError(null);
    setImporting(false);
    onClose();
  };

  // Count cards in the project data
  const countCards = (data) => {
    if (!data?.phases) return 0;

    let count = 0;
    for (const phase of data.phases) {
      for (const subphase of phase.subphases || []) {
        count += (subphase.cards || []).length;
      }
    }
    return count;
  };

  // Count phases
  const countPhases = (data) => {
    return data?.phases?.length || 0;
  };

  // Count subphases
  const countSubphases = (data) => {
    if (!data?.phases) return 0;
    let count = 0;
    for (const phase of data.phases) {
      count += (phase.subphases || []).length;
    }
    return count;
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-scrim z-50"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div
          className="bg-panel border border-line rounded-lg shadow-card w-full max-w-lg mx-4 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-divider">
            <h2 className="text-lg font-bold text-ink">Import Project</h2>
            <button
              onClick={handleClose}
              className="p-1 rounded hover:bg-hover text-muted hover:text-ink transition-colors"
            >
              <span className="text-xl">x</span>
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* File Picker */}
            <div>
              <label className="block text-sm font-medium text-ink mb-2">
                Select Kanban JSON File
              </label>
              <button
                onClick={handleSelectFile}
                className="w-full px-4 py-3 bg-page border border-line rounded-lg hover:border-primary transition-colors text-left flex items-center gap-3"
              >
                <FolderOpen className="w-6 h-6 text-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  {selectedFile ? (
                    <span className="text-ink truncate block">
                      {selectedFile.split(/[/\\]/).pop()}
                    </span>
                  ) : (
                    <span className="text-muted">
                      Click to browse...
                    </span>
                  )}
                </div>
              </button>
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-3 bg-danger/10 border border-danger-text rounded-lg">
                <p className="text-sm text-danger-text">{error}</p>
              </div>
            )}

            {/* Preview */}
            {fileData && (
              <div className="p-4 bg-page rounded-lg border border-line">
                <h3 className="text-sm font-medium text-muted mb-3">
                  Preview
                </h3>

                {/* Project Name */}
                <div className="mb-4">
                  <p className="text-xl font-bold text-ink">
                    {fileData.name || 'Unnamed Project'}
                  </p>
                  {fileData.description && (
                    <p className="text-sm text-muted mt-1 line-clamp-2">
                      {fileData.description}
                    </p>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-2 bg-panel rounded">
                    <p className="text-2xl font-bold text-link">
                      {countPhases(fileData)}
                    </p>
                    <p className="text-xs text-muted">Phases</p>
                  </div>
                  <div className="text-center p-2 bg-panel rounded">
                    <p className="text-2xl font-bold text-success-text">
                      {countSubphases(fileData)}
                    </p>
                    <p className="text-xs text-muted">Subphases</p>
                  </div>
                  <div className="text-center p-2 bg-panel rounded">
                    <p className="text-2xl font-bold text-link">
                      {countCards(fileData)}
                    </p>
                    <p className="text-xs text-muted">Cards</p>
                  </div>
                </div>

                {/* Slug */}
                {fileData.slug && (
                  <p className="text-xs text-muted mt-3">
                    Slug: <code className="bg-panel px-1 rounded">{fileData.slug}</code>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-divider">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-lg text-muted hover:text-ink hover:bg-hover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!fileData || importing}
              className={`
                px-6 py-2 rounded-lg font-medium transition-colors
                ${fileData && !importing
                  ? 'bg-primary hover:bg-primary text-cream'
                  : 'bg-divider text-muted cursor-not-allowed'
                }
              `}
            >
              {importing ? 'Importing...' : 'Import Project'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ImportDialog;
