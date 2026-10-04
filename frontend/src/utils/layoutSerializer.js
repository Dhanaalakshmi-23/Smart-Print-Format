// Converts layout_json between the stored JSON string and the object the designer edits.

export const createEmptyLayout = () => ({ sections: [] })

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

  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
    return { layout: null, error: 'Layout must be a JSON object.' }
  }
  if (!Array.isArray(layout.sections)) {
    return { layout: null, error: "Layout must contain a 'sections' list." }
  }
  return { layout, error: null }
}

export function stringifyLayout(layout) {
  return typeof layout === 'string' ? layout : JSON.stringify(layout ?? createEmptyLayout())
}
