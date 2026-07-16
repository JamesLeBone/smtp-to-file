// @see https://nodemailer.com/extras/smtp-server/
import { SMTPServer } from 'smtp-server'
import { simpleParser } from 'mailparser'

import { writeMeta, writeFileAttachment } from './services/fio'
import type { EmailMeta } from './services/fio'

export const msgId2Filename = (msgId: string): string => {
    return msgId
        .replace(/[<>]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '_')
}

// Constants
const smtpPort = 25

// Types
type EnvelopeAddress = {
    address?: string
}
type SmtpSession = {
    envelope?: {
        rcptTo?: EnvelopeAddress[]
    }
}
type AddressLike = {
    text?: string
}
type AddressValue = {
    address?: string
    name?: string
}
type AddressHeader = {
    text?: string
    value?: AddressValue[]
}
type ParsedEmail = {
    messageId?: string
    date?: Date
    from?: string | AddressLike | AddressLike[] | AddressHeader
    to?: string | AddressLike | AddressLike[] | AddressHeader
    cc?: string | AddressLike | AddressLike[] | AddressHeader
    subject?: string
    text?: string
    html?: string | false
    textAsHtml?: string
    attachments?: Array<{ filename?: string; content: Buffer }>
}

// Functions

const readEmailName = (expected: ParsedEmail['from']): string => {
    if (!expected) return 'No name'
    if (typeof expected === 'string') return expected
    if ('value' in expected && Array.isArray(expected.value)) {
        return expected.value
            .map((entry) => entry.name ? `${entry.name} <${entry.address || ''}>` : (entry.address || ''))
            .filter(Boolean)
            .join(', ')
    }
    if (Array.isArray(expected)) {
        return expected.map((entry) => entry.text || '').join(', ')
    }
    if (expected.text) return expected.text
    return '<blank>'
}

const readEmailAddresses = (expected?: ParsedEmail['to']): string[] => {
    if (!expected) return []
    if (typeof expected === 'string') return []
    if (Array.isArray(expected)) {
        return expected
            .map((entry) => entry.text || '')
            .filter(Boolean)
    }
    if ('value' in expected && Array.isArray(expected.value)) {
        return expected.value
            .map((entry) => (entry.address || '').trim().toLowerCase())
            .filter(Boolean)
    }
    return []
}

const readEnvelopeRecipients = (session?: SmtpSession): string[] => {
    if (!session || !session.envelope || !Array.isArray(session.envelope.rcptTo)) {
        return []
    }

    return session.envelope.rcptTo
        .map((entry) => (entry.address || '').trim().toLowerCase())
        .filter(Boolean)
}

const getDateString = (parsed: ParsedEmail): string => {
    if (!parsed.date) {
        console.warn('Email has no date, using current time')
        return new Date().toISOString()
    }
    return parsed.date.toISOString()
}

const writeEmail = async (parsed: ParsedEmail, session?: SmtpSession): Promise<void> => {
    if (!parsed.messageId) {
        console.error('Email is missing messageId, cannot save')
        return
    }

    let meta: EmailMeta
    try {
        const messageId = msgId2Filename(parsed.messageId)
        const dateString = getDateString(parsed)
        // Standard recipients are those in the email headers (To, Cc)
        // while envelope recipients are those in the SMTP envelope (RCPT TO commands). 
        // The latter may include Bcc recipients that are not visible in the email headers.
        const envelopeRecipients = readEnvelopeRecipients(session)
        // combine To and Cc for visible recipients
        const visibleRecipients = [
            ...readEmailAddresses(parsed.to),
            ...readEmailAddresses(parsed.cc)
        ]
        // BCC recipients are those in the envelope but not in the visible headers
        const hiddenRecipients = envelopeRecipients.filter((recipient) => !visibleRecipients.includes(recipient))
        meta = {
            id: messageId,
            date: dateString,
            from: readEmailName(parsed.from),
            to: readEmailName(parsed.to),
            cc: readEmailName(parsed.cc),
            subject: parsed.subject || '',
            envelopeRecipients,
            hiddenRecipients
        }
    } catch (err) {
        console.error('Failed to process email metadata:', err)
        return
    }
    
    const text = parsed.text
    const html = parsed.html || parsed.textAsHtml || ''

    const written = writeMeta(meta, text, html)
    if (!written) return

    if (parsed.attachments && parsed.attachments.length > 0) {
        let attachmentId = 0
        for (const att of parsed.attachments) {
            const filename = att.filename || `attachment-${attachmentId++}`
            writeFileAttachment(meta.id, att.content, filename)
        }
    }
}

export default function SmtpServer() {
    const smtpServer = new SMTPServer({
        secure: false,
        authOptional: true,
        disabledCommands: ['AUTH', 'STARTTLS'],
        onData(stream: any, session: SmtpSession, callback: (err?: Error | null) => void) {
            simpleParser(stream, {}, (err: Error | null, parsed: ParsedEmail) => {
                if (err) {
                    console.log('Error:', err)
                    return callback(err)
                }

                if (!parsed || typeof parsed !== 'object' || !parsed.messageId) {
                    console.error('Failed to parse email', parsed)
                    return callback(new Error('Failed to parse email'))
                }

                console.info('smtp envelope recipients', readEnvelopeRecipients(session))
                void writeEmail(parsed as ParsedEmail, session)
                callback()
            })
        }
    })

    smtpServer.listen(smtpPort, () => {
        console.log(`SMTP server listening on 0.0.0.0:${smtpPort}`)
    })
}
