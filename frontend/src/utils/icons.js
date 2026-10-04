const PARTY_DOCTYPES = ['Customer', 'Supplier', 'User', 'Employee', 'Contact', 'Lead', 'Sales Person']

export function fieldIcon(df = {}) {
  const label = `${df.label || ''} ${df.fieldname || ''}`.toLowerCase()
  const type = df.fieldtype

  if (label.includes('address')) return '📍'
  if (['Date', 'Datetime', 'Time'].includes(type)) return '📅'
  if (type === 'Currency') return '💰'
  if (['Float', 'Int', 'Percent'].includes(type)) return '🔢'
  if (type === 'Link' && PARTY_DOCTYPES.includes(df.options)) return '👤'
  if (['Link', 'Dynamic Link'].includes(type)) return '🔗'
  if (type === 'Check') return '☑️'
  if (['Select', 'Autocomplete'].includes(type)) return '🔽'
  if (['Attach', 'Attach Image', 'Image', 'Signature'].includes(type)) return '🖼️'
  if (['Text Editor', 'Text', 'Small Text', 'Long Text', 'HTML Editor', 'Markdown Editor', 'Code'].includes(type)) return '📝'
  return '🔤'
}

export function tableIcon(df = {}) {
  const label = `${df.label || ''} ${df.fieldname || ''}`.toLowerCase()
  if (label.includes('tax')) return '💸'
  if (label.includes('payment')) return '💳'
  return '📋'
}

export function componentIcon(component = {}) {
  const text = `${component.component_type || ''} ${component.component_name || ''}`.toLowerCase()
  if (text.includes('logo') || text.includes('image')) return '🏢'
  if (text.includes('divider') || text.includes('line') || text.includes('separator')) return '✂'
  if (text.includes('html')) return '📝'
  if (text.includes('signature')) return '✍️'
  if (text.includes('qr') || text.includes('barcode')) return '🔳'
  return '🧩'
}
