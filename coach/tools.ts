// Tool specs the coach offers the model (docs/PRD_COACH_CHAT.md §12.1). The tools themselves run in the app, on the
// device, against the local database (src/features/coach/tools.ts): the coach only describes them.
import type { ToolName } from './agents'
import type { ToolSpec } from './contract'

const DAYS = { type: 'integer', enum: [7, 14, 30], description: 'How many days back, today included.' }

export const TOOL_SPECS: Record<ToolName, ToolSpec> = {
  get_sleep: {
    name: 'get_sleep',
    description: 'Sleep for the last 7, 14 or 30 days: each night, the average, and nights under 5 h 30 m.',
    parameters: { type: 'object', properties: { days: DAYS }, required: ['days'], additionalProperties: false },
  },
  get_training: {
    name: 'get_training',
    description: 'Training sessions in the last 7, 14 or 30 days with their status, and the heaviest set of each exercise.',
    parameters: { type: 'object', properties: { days: DAYS }, required: ['days'], additionalProperties: false },
  },
  get_exercise_history: {
    name: 'get_exercise_history',
    description: 'The last 6 sessions of one exercise: the top set (load, reps, reps in reserve) of each.',
    parameters: { type: 'object', properties: { exercise: { type: 'string', description: 'Exercise name, e.g. "leg press".' } }, required: ['exercise'], additionalProperties: false },
  },
  get_nutrition: {
    name: 'get_nutrition',
    description: 'Daily calories and protein against target for the last 7, 14 or 30 days, and how many days were logged.',
    parameters: { type: 'object', properties: { days: DAYS }, required: ['days'], additionalProperties: false },
  },
  search_library: {
    name: 'search_library',
    description: "Search the app's exercise library and food list by keyword. Up to 5 matches with key facts.",
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'A few keywords, e.g. "hip hinge dumbbell" or "chicken rice".' } }, required: ['query'], additionalProperties: false },
  },
}
