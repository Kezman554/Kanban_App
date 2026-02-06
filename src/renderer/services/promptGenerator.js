/**
 * Prompt Generator Service
 * Generates Claude Code prompts for Kanban cards using the Anthropic API
 * Gathers full project context before making the API call
 */

import { sendMessageWithRetry, AnthropicError, ErrorTypes } from './anthropic.js'

// System prompt for the prompt generator
const PROMPT_GENERATOR_SYSTEM = `You are generating a Claude Code prompt for a development task.
You will receive project context including PRD, progress, completed sessions, and card details.
IMPORTANT: The "USER INSTRUCTIONS" section is the user's direct request. This takes priority.

If user instructions are provided, follow them as your primary guide
If user instructions are empty, infer what's needed from the card title, description, and success criteria

Rules for the generated prompt:

Do NOT include "Read CLAUDE.md" - Claude Code does this automatically
Do NOT include checkpoint or verification lines at the end
Do NOT include git commit instructions - this is handled separately
DO reference specific files created in previous sessions when relevant
DO include clear numbered steps for what to build
DO end with a brief "Test by..." line
Keep the prompt focused and actionable

Return ONLY the prompt text, no preamble, explanation, or markdown code blocks.`

/**
 * Gather all context needed for prompt generation
 * @param {Object} options
 * @param {Object} options.card - Card data from database
 * @param {Object} options.project - Project data from database
 * @returns {Promise<Object>} - Gathered context
 */
async function gatherContext({ card, project }) {
  const context = {
    projectName: project?.name || 'Unknown Project',
    prd: null,
    progress: null,
    doneCards: []
  }

  // Get project files (PRD and progress.txt)
  if (project?.directory_path) {
    try {
      const files = await window.electron.readProjectFiles(
        project.directory_path,
        project.prd_path
      )
      context.prd = files.prd
      context.progress = files.progress
    } catch (error) {
      console.error('Failed to read project files:', error)
    }
  }

  // Get done cards for the project
  if (project?.id) {
    try {
      context.doneCards = await window.electron.getDoneCards(project.id)
    } catch (error) {
      console.error('Failed to get done cards:', error)
    }
  }

  return context
}

/**
 * Format the full context message for the API
 * @param {Object} card - Card data
 * @param {Object} context - Gathered context from gatherContext
 * @returns {string} - Formatted context string
 */
function formatContextMessage(card, context) {
  const parts = []

  // Project context
  parts.push(`=== PROJECT CONTEXT ===`)
  parts.push(`Project: ${context.projectName}`)

  // PRD
  parts.push(`\n=== PRD ===`)
  parts.push(context.prd || 'No PRD file found at expected location')

  // Progress
  parts.push(`\n=== PROGRESS SO FAR ===`)
  parts.push(context.progress || 'No progress file found - this may be early in the project')

  // Completed sessions
  parts.push(`\n=== COMPLETED SESSIONS ===`)
  if (context.doneCards && context.doneCards.length > 0) {
    context.doneCards.forEach(doneCard => {
      parts.push(`\nSession ${doneCard.session_letter}: ${doneCard.title}`)
      parts.push(`Success Criteria: ${doneCard.success_criteria || 'None'}`)
      parts.push(`Notes: ${doneCard.notes || 'None'}`)
    })
  } else {
    parts.push('No completed sessions yet')
  }

  // Card to generate prompt for
  parts.push(`\n=== CARD TO GENERATE PROMPT FOR ===`)
  parts.push(`Session: ${card.session_letter}`)
  parts.push(`Title: ${card.title}`)
  parts.push(`Description: ${card.description || 'None'}`)
  parts.push(`Success Criteria: ${card.success_criteria || 'None'}`)

  // User instructions (notes field)
  parts.push(`\n=== USER INSTRUCTIONS ===`)
  parts.push(card.notes || 'None provided - generate based on card details above')

  return parts.join('\n')
}

/**
 * Generate a prompt for a Kanban card
 *
 * @param {Object} options - Generation options
 * @param {Object} options.card - Card data from database
 * @param {Object} options.project - Project data from database
 * @returns {Promise<Object>} - Generated result with prompt text
 */
export async function generatePrompt({ card, project }) {
  // Validate inputs
  if (!card) {
    throw new Error('Card data is required')
  }

  if (!card.session_letter || !card.title) {
    throw new Error('Card must have session_letter and title')
  }

  // Gather all context
  const context = await gatherContext({ card, project })

  // Format the user message
  const userMessage = formatContextMessage(card, context)

  try {
    const response = await sendMessageWithRetry({
      system: PROMPT_GENERATOR_SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 4096,
      temperature: 0.3
    })

    // The response is just the prompt text - no JSON parsing needed
    const promptText = response.text.trim()

    return {
      success: true,
      prompt: promptText,
      usage: response.usage
    }
  } catch (error) {
    if (error instanceof AnthropicError) {
      return {
        success: false,
        error: error.message,
        errorType: error.type,
        retryAfter: error.retryAfter
      }
    }

    return {
      success: false,
      error: error.message,
      errorType: ErrorTypes.UNKNOWN
    }
  }
}

/**
 * Test the prompt generator with sample data
 * @returns {Promise<Object>} - Test result
 */
export async function testPromptGenerator() {
  const sampleCard = {
    id: 1,
    session_letter: 'TEST',
    title: 'Test Session: Verify Prompt Generator',
    description: 'A test card to verify the prompt generator service is working correctly.',
    success_criteria: 'The prompt generator returns a valid prompt.',
    complexity: 'low',
    resource: 'anthropic_api',
    depends_on_cards: [],
    notes: null
  }

  const sampleProject = {
    id: 1,
    name: 'Test Project',
    directory_path: null,
    prd_path: null
  }

  console.log('Testing prompt generator with sample data...')

  const result = await generatePrompt({
    card: sampleCard,
    project: sampleProject
  })

  if (result.success) {
    console.log('Prompt generator test PASSED')
    console.log('Generated prompt length:', result.prompt.length)
    console.log('Token usage:', result.usage)
  } else {
    console.error('Prompt generator test FAILED:', result.error)
  }

  return result
}

export default {
  generatePrompt,
  testPromptGenerator
}
