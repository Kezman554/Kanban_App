/**
 * Prompt Generator Service
 * Generates Claude Code prompts for Kanban cards using the Anthropic API
 * Based on the prompt generator skill from DESIGN_SUMMARY
 */

import { sendMessageWithRetry, AnthropicError, ErrorTypes } from './anthropic.js'

// System prompt for the prompt generator skill
const PROMPT_GENERATOR_SYSTEM = `You are a prompt generator for a Kanban project management app that orchestrates Claude Code sessions. Your task is to generate complete, ready-to-run prompts for Claude Code.

## Your Role

When given a card from the Kanban board, along with the project's PRD and progress.json, you generate a prompt that Claude Code can execute to complete that card's task.

## Input You Receive

1. **Card Data**: The specific task card with title, description, success criteria, and other metadata
2. **PRD Document**: The project's Product Requirements Document with full context
3. **Progress.json**: Record of completed sessions, files created/modified, and current project structure

## Your Output Format

You MUST respond with a JSON object containing exactly these fields:

\`\`\`json
{
  "prompt": "The complete Claude Code prompt ready to run",
  "checkpoint": "Verification steps to confirm the task is complete",
  "commitMessage": "Git commit message for when the work is done"
}
\`\`\`

## Prompt Generation Guidelines

When generating the prompt:

1. **Reference What Exists**
   - Use progress.json to understand what's already built
   - Reference specific files and directories that exist
   - Build on previous work, don't recreate

2. **Include Context**
   - Reference relevant parts of the PRD
   - Mention dependencies and how they connect
   - Note any previous sessions that relate to this task

3. **Be Specific**
   - Include concrete implementation steps
   - Specify file paths and component names
   - Reference existing patterns in the codebase

4. **Include Testing**
   - Add testing requirements appropriate to the task
   - Reference existing test patterns if applicable

5. **Progress Tracking**
   - Include instruction to update progress.json when done
   - Specify what to add (files created/modified, notes)

## Checkpoint Guidelines

The checkpoint should:
- List specific, verifiable checks
- Include both technical and functional verification
- Be actionable (the user can actually verify these)

## Commit Message Guidelines

- Use conventional commit format when applicable (feat:, fix:, refactor:, etc.)
- Be descriptive but concise
- Reference the session letter

## Example Output

For a card about adding a settings page:

\`\`\`json
{
  "prompt": "Create the Settings page component for the Kanban app.\\n\\nContext:\\n- This builds on the layout shell created in Session F (see src/renderer/components/Layout.jsx)\\n- Navigation already includes a Settings link\\n- Use the existing Tailwind CSS patterns from other pages\\n\\nImplementation:\\n1. Create src/renderer/pages/SettingsPage.jsx\\n2. Add sections for: Theme, API Key configuration, Data management\\n3. Use the same card styling from existing components\\n4. Wire up the route in App.jsx\\n\\nTesting:\\n- Verify navigation works from sidebar\\n- Check responsive layout\\n- Ensure settings persist (if implementing persistence)\\n\\nWhen complete, update progress.json with the files created and any relevant notes.",
  "checkpoint": "1. Settings page renders at /settings route\\n2. Navigation link works from sidebar\\n3. All three sections (Theme, API, Data) are visible\\n4. Matches existing app styling\\n5. progress.json is updated",
  "commitMessage": "G: Add Settings page with theme, API, and data sections"
}
\`\`\`

Always respond with valid JSON only. Do not include any text before or after the JSON object.`

/**
 * Parse the API response to extract prompt, checkpoint, and commit message
 * Handles both clean JSON and JSON embedded in markdown code blocks
 *
 * @param {string} responseText - Raw text response from the API
 * @returns {Object} - Parsed result with prompt, checkpoint, commitMessage
 */
function parseResponse(responseText) {
  let jsonStr = responseText.trim()

  // Try to extract JSON from markdown code blocks
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim()
  }

  try {
    const parsed = JSON.parse(jsonStr)

    // Validate required fields
    if (!parsed.prompt) {
      throw new Error('Response missing required "prompt" field')
    }
    if (!parsed.checkpoint) {
      throw new Error('Response missing required "checkpoint" field')
    }
    if (!parsed.commitMessage) {
      throw new Error('Response missing required "commitMessage" field')
    }

    return {
      prompt: parsed.prompt,
      checkpoint: parsed.checkpoint,
      commitMessage: parsed.commitMessage
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse API response as JSON: ${error.message}\n\nRaw response:\n${responseText.substring(0, 500)}...`)
    }
    throw error
  }
}

/**
 * Format card data for the API request
 *
 * @param {Object} card - Card object from database
 * @returns {string} - Formatted card data string
 */
function formatCardData(card) {
  const parts = [
    `Session: ${card.session_letter}`,
    `Title: ${card.title}`,
    `Description: ${card.description || 'No description provided'}`,
    `Success Criteria: ${card.success_criteria || 'No specific criteria'}`,
    `Complexity: ${card.complexity || 'medium'}`,
    `Resource: ${card.resource || 'claude_sub'}`
  ]

  if (card.depends_on_cards && card.depends_on_cards.length > 0) {
    const deps = Array.isArray(card.depends_on_cards)
      ? card.depends_on_cards
      : JSON.parse(card.depends_on_cards)
    if (deps.length > 0) {
      parts.push(`Dependencies: Sessions ${deps.join(', ')}`)
    }
  }

  if (card.prompt_guide) {
    parts.push(`Prompt Guide: ${card.prompt_guide}`)
  }

  return parts.join('\n')
}

/**
 * Format progress.json content for the API request
 *
 * @param {Object} progress - Progress object
 * @returns {string} - Formatted progress string
 */
function formatProgress(progress) {
  if (!progress) {
    return 'No progress.json available - this appears to be the first session.'
  }

  const parts = [`Project: ${progress.project || 'Unknown'}`]

  if (progress.completed_sessions && progress.completed_sessions.length > 0) {
    parts.push('\nCompleted Sessions:')
    progress.completed_sessions.forEach(session => {
      parts.push(`- ${session.session}: ${session.title}`)
      if (session.files_created?.length > 0) {
        parts.push(`  Created: ${session.files_created.join(', ')}`)
      }
      if (session.files_modified?.length > 0) {
        parts.push(`  Modified: ${session.files_modified.join(', ')}`)
      }
      if (session.notes) {
        parts.push(`  Notes: ${session.notes}`)
      }
    })
  }

  if (progress.current_structure) {
    parts.push('\nCurrent Project Structure:')
    Object.entries(progress.current_structure).forEach(([dir, files]) => {
      parts.push(`- ${dir}/: ${Array.isArray(files) ? files.join(', ') : files}`)
    })
  }

  return parts.join('\n')
}

/**
 * Generate a prompt for a Kanban card
 *
 * @param {Object} options - Generation options
 * @param {Object} options.card - Card data from database
 * @param {string} options.prdContent - PRD document content
 * @param {Object} options.progress - Progress.json content (parsed object)
 * @returns {Promise<Object>} - Generated result with prompt, checkpoint, commitMessage
 */
export async function generatePrompt({ card, prdContent, progress }) {
  // Validate inputs
  if (!card) {
    throw new Error('Card data is required')
  }

  if (!card.session_letter || !card.title) {
    throw new Error('Card must have session_letter and title')
  }

  // Format the request content
  const cardDataStr = formatCardData(card)
  const progressStr = formatProgress(progress)
  const prdStr = prdContent || 'No PRD document provided.'

  const userMessage = `Generate a Claude Code prompt for this card:

## Card Data
${cardDataStr}

## PRD Document
${prdStr}

## Progress (What's Been Built)
${progressStr}

Generate the prompt, checkpoint, and commit message as a JSON object.`

  try {
    const response = await sendMessageWithRetry({
      system: PROMPT_GENERATOR_SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 4096,
      temperature: 0.3 // Lower temperature for more consistent output
    })

    const result = parseResponse(response.text)

    return {
      success: true,
      ...result,
      usage: response.usage
    }
  } catch (error) {
    // Re-throw with more context
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
 * Useful for verifying the service works correctly
 *
 * @returns {Promise<Object>} - Test result
 */
export async function testPromptGenerator() {
  const sampleCard = {
    id: 1,
    session_letter: 'TEST',
    title: 'Test Session: Verify Prompt Generator',
    description: 'A test card to verify the prompt generator service is working correctly.',
    success_criteria: 'The prompt generator returns valid JSON with prompt, checkpoint, and commit message.',
    complexity: 'low',
    resource: 'anthropic_api',
    depends_on_cards: []
  }

  const samplePrd = `# Test Project PRD

## Overview
This is a test project to verify the prompt generator service.

## Goals
- Verify API connectivity
- Verify response parsing
- Verify error handling`

  const sampleProgress = {
    project: 'test-project',
    last_updated: new Date().toISOString(),
    completed_sessions: [],
    current_structure: {
      src: ['main.js'],
      docs: ['README.md']
    }
  }

  console.log('Testing prompt generator with sample data...')

  const result = await generatePrompt({
    card: sampleCard,
    prdContent: samplePrd,
    progress: sampleProgress
  })

  if (result.success) {
    console.log('Prompt generator test PASSED')
    console.log('Generated prompt length:', result.prompt.length)
    console.log('Checkpoint length:', result.checkpoint.length)
    console.log('Commit message:', result.commitMessage)
    console.log('Token usage:', result.usage)
  } else {
    console.error('Prompt generator test FAILED:', result.error)
  }

  return result
}

export default {
  generatePrompt,
  testPromptGenerator,
  parseResponse,
  formatCardData,
  formatProgress
}
