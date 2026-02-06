const fs = require('fs')
const path = require('path')

/**
 * Read project files (PRD and progress.txt) from the project directory
 * @param {string} directoryPath - The project's directory path
 * @param {string} prdPath - The PRD filename (relative to docs/)
 * @returns {{ prd: string|null, progress: string|null }}
 */
function readProjectFiles(directoryPath, prdPath) {
  const result = { prd: null, progress: null }

  if (!directoryPath) {
    return result
  }

  // Read PRD from {directoryPath}/docs/{prdPath}
  if (prdPath) {
    try {
      const prdFullPath = path.join(directoryPath, 'docs', prdPath)
      if (fs.existsSync(prdFullPath)) {
        result.prd = fs.readFileSync(prdFullPath, 'utf-8')
      }
    } catch (error) {
      console.error('Error reading PRD file:', error.message)
    }
  }

  // Read progress.txt from {directoryPath}/docs/progress.txt
  try {
    const progressPath = path.join(directoryPath, 'docs', 'progress.txt')
    if (fs.existsSync(progressPath)) {
      result.progress = fs.readFileSync(progressPath, 'utf-8')
    }
  } catch (error) {
    console.error('Error reading progress.txt:', error.message)
  }

  return result
}

module.exports = { readProjectFiles }
