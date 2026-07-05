export const INITIAL_STATUS = Object.freeze({ state: 'IDLE', message: '' });

export function statusReducer(state, event) {
  switch (event.type) {
    case 'START_EXTRACT':    return { state: 'EXTRACTING', message: '' };
    case 'EXTRACT_DONE':     return { state: 'UPLOADING', message: '' };
    case 'ATTACHED':         return { state: 'ATTACHED', message: '' };
    case 'FALLBACK':         return { state: 'FALLBACK_CLIPBOARD', message: 'Auto-attach failed. Press ⌘V in Gemini.' };
    case 'ERROR':            return { state: 'ERROR', message: event.message || 'Unknown error' };
    case 'RESET':            return { ...INITIAL_STATUS };
    default:                 return state;
  }
}
