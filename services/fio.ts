import fs from 'node:fs'

export type EmailMeta = {
    id: string
    date: string
    from: string
    to: string
    cc?: string
    subject: string
    envelopeRecipients: string[]
    hiddenRecipients: string[]
}
export type attachment = {
    filename: string
    content: string
}

export const list = () : EmailMeta[] => {
    const dir = fs.readdirSync('./inbox')
    const emails: EmailMeta[] = []
    for (const d of dir) {
        const meta = readMetaById(d)
        if (meta) emails.push(meta)
    }
    return emails
}

const inbox = (id:string) => '../inbox/'+id

// Reads
export const readEmailFile = (id: string, type: 'text' | 'html'): string | undefined => {
    const filePath = inbox(id)
    if (!fs.existsSync(filePath)) return undefined

    const filename = filePath + '/' + type + (type === 'text' ? '.txt' : '.html')
    if (!fs.existsSync(filename)) return undefined

    return fs.readFileSync(filename, 'utf8')
}

export const readMetaById = (id:string) : EmailMeta | null => {
    const filePath = inbox(id)
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

export const readAttachments = (id:string) : attachment[] => {
    const emailDir = inbox(id)
    const attDir = emailDir + '/attachments'

    if (!fs.existsSync(attDir)) {
        return []
    }
    const attList: attachment[] = []

    const attFiles = fs.readdirSync(attDir)
    for (const af of attFiles) {
        const content = fs.readFileSync(attDir + '/' + af)
        attList.push({
            filename: af,
            content: content.toString('base64')
        })
    }
    return attList
}

export const deleteEmail = (id:string): boolean => {
    const emailDir = inbox(id)
    if (!fs.existsSync(emailDir)) return true

    fs.rmSync(emailDir, { recursive: true, force: true })
    return !fs.existsSync(emailDir)
}
// Writes

export const writeMeta = (meta: EmailMeta, text?:string, html?:string) : boolean => {
    const loc = inbox(meta.id)
    console.log(`Email received from ${meta.from} to ${meta.to}: ${meta.subject}`)
    
    const attDir = loc + '/attachments'
    try {
        fs.mkdirSync(loc, { recursive: true })
        fs.writeFileSync(loc + '/meta.json', JSON.stringify(meta, null, 4))
        fs.mkdirSync(attDir)

        if (text) {
            fs.writeFileSync(loc + '/text.txt', text)
        }
        if (html) {
            fs.writeFileSync(loc + '/html.html', html)
        }
    } catch (err) {
        console.error('Failed to write email:', err)
        if (fs.existsSync(loc)) {
            fs.rmSync(loc, { recursive: true, force: true })
        }
        return false
    }
    console.log(`Email body saved`)
    return true
}
export const writeFileAttachment = async (id:string, content:Buffer, filename:string): Promise<boolean> => {
    const loc = inbox(id)
    const attDir = loc + '/attachments'

    if (!fs.existsSync(attDir)) {
        console.error('Attachment directory does not exist for email ID:', id)
        return false
    }

    const filePath = attDir + '/' + filename
    const result = await fs.promises.writeFile(filePath, content)
    .then(() => true , (err) => {
        console.error('Failed to write attachment:', err)
        return false
    })
    return result
}
