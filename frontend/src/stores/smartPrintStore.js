import { defineStore } from 'pinia'
import {
  getSmartPrintFormat,
  publishSmartPrintFormat,
  saveSmartPrintFormat,
} from '@/api/smartPrintApi'
import { findNode } from '@/utils/layout'
import { createEmptyLayout as emptyLayout } from '@/utils/layoutSerializer'

function withoutLayout(doc) {
  const { layout_json, ...rest } = doc
  return rest
}

export const useSmartPrintStore = defineStore('smartPrint', {
  state: () => ({
    currentSPF: null,
    targetDoctype: null,
    layoutJson: emptyLayout(),
    selectedNode: null,
    isDirty: false,
    status: 'idle',
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
    newSPF(values = {}, layout = null) {
      this.currentSPF = { ...values }
      this.targetDoctype = values.target_doctype || null
      this.layoutJson = layout || emptyLayout()
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

    selectNode(id) {
      this.selectedNode = id
    },

    clearSelection() {
      this.selectedNode = null
    },

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

    async save({ changeSummary } = {}) {
      this.status = 'saving'
      this.error = null
      // Cleared before the request, so edits made while saving mark it dirty again.
      this.isDirty = false
      try {
        const doc = await saveSmartPrintFormat({
          ...this.currentSPF,
          target_doctype: this.targetDoctype,
          layout_json: this.layoutJson,
          change_summary: changeSummary,
        })
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
        await this.save({ changeSummary })
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
