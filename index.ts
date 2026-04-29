// @see https://nodemailer.com/extras/smtp-server/
import { SMTPServer } from 'smtp-server'
import { simpleParser } from 'mailparser'
import fs from 'node:fs'
import express, { Request, Response } from 'express'

const smtpPort = 25
const httpPort = 8085

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

type EnvelopeAddress = {
    address?: string
}

type SmtpSession = {
    envelope?: {
        rcptTo?: EnvelopeAddress[]
    }
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

type EmailMeta = {
    id: string
    date: string
    from: string
    to: string
    cc?: string
    subject: string
    envelopeRecipients: string[]
    hiddenRecipients: string[]
}

interface EmailDetails extends EmailMeta {
    text?: string
    html?: string
    attachments: Array<{
        filename: string
        content: string
    }>
}

const msgId2Filename = (msgId: string): string => {
    return msgId
        .replace(/[<>]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '_')
}

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
        throw new Error('messageId is required')
    }
    const messageId = msgId2Filename(parsed.messageId)

    try {
        const loc = './inbox/' + messageId
        fs.mkdirSync(loc, { recursive: true })

        if (parsed.text) {
            fs.writeFileSync(loc + '/text.txt', parsed.text)
        }
        if (parsed.html) {
            fs.writeFileSync(loc + '/html.html', parsed.html || parsed.textAsHtml || '')
        }

        const dateString = getDateString(parsed)
        const envelopeRecipients = readEnvelopeRecipients(session)
        const visibleRecipients = [
            ...readEmailAddresses(parsed.to),
            ...readEmailAddresses(parsed.cc)
        ]
        const hiddenRecipients = envelopeRecipients.filter((recipient) => !visibleRecipients.includes(recipient))

        const json: EmailMeta = {
            id: messageId,
            date: dateString,
            from: readEmailName(parsed.from),
            to: readEmailName(parsed.to),
            cc: readEmailName(parsed.cc),
            subject: parsed.subject || '',
            envelopeRecipients,
            hiddenRecipients
        }

        fs.writeFileSync(loc + '/meta.json', JSON.stringify(json, null, 4))
        console.log('Email Received:', json, parsed.text ? '\n' + parsed.text : '')

        if (parsed.attachments && parsed.attachments.length > 0) {
            const attDir = loc + '/attachments'
            fs.mkdirSync(attDir, { recursive: true })
            for (const att of parsed.attachments) {
                const filename = att.filename || 'attachment.bin'
                fs.writeFileSync(attDir + '/' + filename, att.content)
            }
        }
    } catch (err) {
        console.error('Failed to write email:', err)
    }
}

const readMetaById = (id: string): EmailMeta | null => {
    const filePath = './inbox/' + id
    if (!fs.existsSync(filePath)) {
        return null
    }

    const metaFile = filePath + '/meta.json'
    if (!fs.existsSync(metaFile)) {
        return {
            id,
            date: fs.statSync(filePath).ctime.toISOString(),
            from: 'Unknown (missing meta.json)',
            to: 'Unknown',
            subject: 'Unknown',
            envelopeRecipients: [],
            hiddenRecipients: []
        }
    }

    return JSON.parse(fs.readFileSync(metaFile, 'utf8')) as EmailMeta
}

const readEmailFile = (id: string, type: 'text' | 'html'): string | undefined => {
    const filePath = './inbox/' + id
    if (!fs.existsSync(filePath)) return undefined

    const filename = filePath + '/' + type + (type === 'text' ? '.txt' : '.html')
    if (!fs.existsSync(filename)) return undefined

    return fs.readFileSync(filename, 'utf8')
}

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

const httpServer = express()

httpServer.get('/', (_req: Request, res: Response) => {
    const dir = fs.readdirSync('./inbox')
    const emails: EmailMeta[] = []
    for (const d of dir) {
        const meta = readMetaById(d)
        if (meta) emails.push(meta)
    }
    res.json(emails)
})

httpServer.get('/email/:id', (req: Request, res: Response) => {
    if (!req.params.id || typeof req.params.id !== 'string') {
        res.status(400).json({ success: false, error: 'Email id is required' })
        return
    }
    const id = msgId2Filename(req.params.id)
    console.info('Fetching email id=', id)

    const meta = readMetaById(id)
    if (!meta) {
        res.status(404).json({ success: false, error: 'Email not found' })
        return
    }

    const result: EmailDetails = {
        ...meta,
        attachments: []
    }

    result.text = readEmailFile(id, 'text')
    result.html = readEmailFile(id, 'html')

    const emailDir = './inbox/' + id
    const attDir = emailDir + '/attachments'
    if (fs.existsSync(attDir)) {
        const attFiles = fs.readdirSync(attDir)
        for (const af of attFiles) {
            const content = fs.readFileSync(attDir + '/' + af)
            result.attachments.push({
                filename: af,
                content: content.toString('base64')
            })
        }
    }

    res.json(result)
})

httpServer.delete('/email/:id', (req: Request, res: Response) => {
    if (!req.params.id || typeof req.params.id !== 'string') {
        res.status(400).json({ success: false, error: 'Email id is required' })
        return
    }
    const id = msgId2Filename(req.params.id)
    console.info('Deleting email id=', id)

    const emailDir = './inbox/' + id
    const metaFile = emailDir + '/meta.json'

    if (!fs.existsSync(metaFile)) {
        res.status(404).json({ success: false, error: 'Email not found' })
        return
    }

    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as EmailMeta
    if (meta.id !== id) {
        res.status(404).json({ success: false, error: 'Email not found' })
        return
    }

    fs.rmSync(emailDir, { recursive: true, force: true })
    res.json({ success: true })
})

httpServer.delete('/emails', (_req: Request, res: Response) => {
    const dir = fs.readdirSync('./inbox')
    for (const d of dir) {
        fs.rmSync('./inbox/' + d, { recursive: true, force: true })
    }
    res.json({ success: true })
})

httpServer.use((_req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'Not found' })
})

httpServer.listen(httpPort, '0.0.0.0', () => {
    console.info('starting')
    console.log(`HTTP server listening on 0.0.0.0:${httpPort}`)
})
