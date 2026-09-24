// Convert layout JSON to and from its string form (as stored in
// Smart Print Format.layout_json).

export const createEmptyLayout = () => ({ sections: [] })

// Parse a layout coming from the server, a file, or the clipboard.
// Never throws: returns { layout, error } so callers can show the problem.
// Accepts a JSON string, an already-parsed object, or an empty value.
export function parseLayout(value) {
  if (value == null || value === '') {
    return { layout: createEmptyLayout(), error: null }
  }

  let layout = value
  if (typeof value === 'string') {
    try {
      layout = JSON.parse(value)
    } catch (err) {
      return { layout: null, error: `Layout is not valid JSON: ${err.message}` }
    }
  }

  // Same basic shape the backend (validate_layout_json) insists on.
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
    return { layout: null, error: 'Layout must be a JSON object.' }
  }
  if (!Array.isArray(layout.sections)) {
    return { layout: null, error: "Layout must contain a 'sections' list." }
  }
  return { layout, error: null }
}

// Turn a layout into a JSON string. Pass { pretty: true } for readable output
// (e.g. export/download). Throws only for values JSON can't represent,
// such as circular references, which indicates a bug rather than bad input.
export function stringifyLayout(layout, { pretty = false } = {}) {
  try {
    return JSON.stringify(layout ?? createEmptyLayout(), null, pretty ? 2 : 0)
  } catch (err) {
    throw new Error(`Layout could not be serialized: ${err.message}`)
  }
}
