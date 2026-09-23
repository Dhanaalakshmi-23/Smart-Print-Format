// State of the Smart Print Format currently open in the designer.
//
// `layoutJson` is the frontend source of truth for the layout: the designer
// reads and edits it here, and it is only sent to the server on save/publish.
// All server calls go through src/api/smartPrintApi.js.

import { defineStore } from 'pinia'
import {
  getSmartPrintFormat,
  publishSmartPrintFormat,
  saveSmartPrintFormat,
} from '@/api/smartPrintApi'

const emptyLayout = () => ({ sections: [] })

// Depth-first search for a node with the given id anywhere in the layout
// (sections, their columns, components, ...). Every node carries an `id`.
function findNode(node, id) {
  if (!node || typeof node !== 'object') return null
  if (node.id === id) return node

  for (const value of Object.values(node)) {
    if (!Array.isArray(value)) continue
    for (const child of value) {
      const found = findNode(child, id)
      if (found) return found
    }
  }
  return null
}

// The server doc without layout_json, so the layout only lives in one place.
function withoutLayout(doc) {
  const { layout_json, ...rest } = doc
  return rest
}

export const useSmartPrintStore = defineStore('smartPrint', {
  state: () => ({
    currentSPF: null, // server fields of the open doc (name, title, print_format, ...)
    targetDoctype: null,
    layoutJson: emptyLayout(),
    selectedNode: null, // id of the selected layout node
    isDirty: false,
    status: 'idle', // 'idle' | 'loading' | 'saving' | 'publishing' | 'error'
    error: null,
  }),

  getters: {
    isNew: (state) => !state.currentSPF?.name,
    isBusy: (state) => ['loading', 'saving', 'publishing'].includes(state.status),
    sections: (state) => state.layoutJson.sections,
    selectedNodeData: (state) =>
      state.selectedNode ? findNode(state.layoutJson, state.selectedNode) : null,
  },

  actions: {
    // ---- Local state updates ----

    newSPF(values = {}) {
      this.currentSPF = { ...values }
      this.targetDoctype = values.target_doctype || null
      this.layoutJson = emptyLayout()
      this.selectedNode = null
      this.isDirty = false
      this.status = 'idle'
      this.error = null
    },

    setTargetDoctype(doctype) {
      if (doctype === this.targetDoctype) return
      this.targetDoctype = doctype
      this.isDirty = true
    },

    // Other fields of the doc (title, print_format, description, ...).
    setFields(values) {
      this.currentSPF = { ...this.currentSPF, ...values }
      this.isDirty = true
    },

    setLayout(layout) {
      this.layoutJson = layout || emptyLayout()
      if (this.selectedNode && !findNode(this.layoutJson, this.selectedNode)) {
        this.selectedNode = null
      }
      this.isDirty = true
    },

    updateNode(id, changes) {
      const node = findNode(this.layoutJson, id)
      if (!node) return
      Object.assign(node, changes)
      this.isDirty = true
    },

    selectNode(id) {
      this.selectedNode = id
    },

    clearSelection() {
      this.selectedNode = null
    },

    // ---- Server sync (API calls live in src/api/) ----

    async load(name) {
      this.status = 'loading'
      this.error = null
      try {
        const doc = await getSmartPrintFormat(name)
        this.currentSPF = withoutLayout(doc)
        this.targetDoctype = doc.target_doctype
        this.layoutJson = doc.layout_json || emptyLayout()
        this.selectedNode = null
        this.isDirty = false
        this.status = 'idle'
      } catch (error) {
        this.fail(error)
      }
    },

    async save() {
      this.status = 'saving'
      this.error = null
      // Cleared before the request: edits made while saving set it back to true.
      this.isDirty = false
      try {
        const doc = await saveSmartPrintFormat({
          ...this.currentSPF,
          target_doctype: this.targetDoctype,
          layout_json: this.layoutJson,
        })
        // Keep the local layout: it may have changed while the request ran.
        this.currentSPF = withoutLayout(doc)
        this.status = 'idle'
        return doc
      } catch (error) {
        this.isDirty = true
        this.fail(error)
      }
    },

    async publish({ changeSummary = '' } = {}) {
      if (this.isNew || this.isDirty) {
        await this.save()
        if (this.status === 'error') return
      }

      this.status = 'publishing'
      this.error = null
      try {
        const doc = await publishSmartPrintFormat(this.currentSPF.name, { changeSummary })
        this.currentSPF = withoutLayout(doc)
        this.status = 'idle'
        return doc
      } catch (error) {
        this.fail(error)
      }
    },

    fail(error) {
      this.status = 'error'
      this.error = error.message
    },
  },
})
