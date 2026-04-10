// XML serialization/parsing for APS Fawateer-E messages.
// All messages are wrapped in <MFEP> envelope.
// SOAP support is added by wrapping the inner MFEP body in a SOAP envelope.

import { XMLParser, XMLBuilder } from 'fast-xml-parser'

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  trimValues: true,
  // Treat known repeatable elements as arrays
  isArray: (name: string) => ['BillRec', 'TrxInf', 'SubPmt', 'CustomField'].includes(name),
}

const builderOptions = {
  ignoreAttributes: false,
  format: true,
  indentBy: '  ',
  suppressEmptyNode: false,
}

const parser = new XMLParser(parserOptions)
const builder = new XMLBuilder(builderOptions)

/**
 * Parse an incoming MFEP message body. Handles both REST (raw XML)
 * and SOAP (XML wrapped in soap:Envelope/soap:Body/...).
 */
export function parseMfep(xml: string): any {
  if (!xml || typeof xml !== 'string') {
    throw new Error('Empty XML body')
  }

  const parsed = parser.parse(xml)

  // SOAP envelope handling — strip the envelope and dig down to MFEP
  if (parsed['soap:Envelope']) {
    const body = parsed['soap:Envelope']['soap:Body']
    // Find the first inner element that contains MFEP
    for (const key of Object.keys(body || {})) {
      const inner = body[key]
      if (inner?.MFEP) return inner.MFEP
      // Try one level deeper (e.g. <BillPullRequest><MFEP>...)
      for (const innerKey of Object.keys(inner || {})) {
        const v = inner[innerKey]
        if (v?.MFEP) return v.MFEP
      }
    }
    throw new Error('Could not locate MFEP inside SOAP envelope')
  }

  // Plain MFEP envelope
  if (parsed.MFEP) return parsed.MFEP

  throw new Error('Invalid message: no MFEP envelope found')
}

/** Build an MFEP XML response (REST). */
export function buildMfep(content: any): string {
  const xml = builder.build({ MFEP: content })
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml
}

/** Build a SOAP envelope wrapping an MFEP response (used when caller used SOAP). */
export function buildSoapResponse(operation: 'BillPull' | 'ReceivePaymentNotification', mfep: any): string {
  const resultElement = `${operation}Result`
  const responseElement = `${operation}Response`
  const inner = builder.build({ MFEP: mfep })

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
<soap:Header/>
<soap:Body>
<${responseElement} xmlns="http://tempuri.org/">
<${resultElement}>
${inner}
</${resultElement}>
</${responseElement}>
</soap:Body>
</soap:Envelope>`
}

/** ISO timestamp in APS format: YYYY-MM-DDTHH:MM:SS (no milliseconds, no zone) */
export function apsTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** APS date format: YYYY-MM-DD */
export function apsDate(d: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Detect if request is SOAP based on content-type or body inspection */
export function isSoap(contentType: string | null, body: string): boolean {
  if (contentType?.toLowerCase().includes('soap')) return true
  return body.includes('soap:Envelope') || body.includes('<Envelope')
}
