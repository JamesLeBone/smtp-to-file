// @see https://nodemailer.com/extras/smtp-server/
const SMTPServer = require("smtp-server").SMTPServer;
const parser = require("mailparser").simpleParser
const fs = require("fs")
const express = require("express")
const port = 25

const msgId2Filename = (msgId) => msgId.replace(/[^a-zA-Z0-9]/g,'_')

const readEmailName = (expected) => {
    if (!expected) return 'No name'
    if (typeof expected === 'string') return expected
    if (Array.isArray(expected)) {
        return expected.map(e => e.text).join(', ')
    }
    if (expected.text) return expected.text
    return '<blank>'
}

const writeEmail = async (parsed) => {
    try {
        const loc = './inbox/'+msgId2Filename(parsed.messageId)
        fs.mkdirSync(loc, { recursive: true })
        
        if (parsed.text) {
            fs.writeFileSync(loc+'/text.txt', parsed.text)
        }
        if (parsed.html) {
            fs.writeFileSync(loc+'/html.html', parsed.html || parsed.textAsHtml)
        }

        const json = {
            id : parsed.messageId,
            date: parsed.date.toISOString(),
            from: readEmailName(parsed.from),
            to: readEmailName(parsed.to),
            subject: parsed.subject,
        }
        fs.writeFileSync(loc+'/meta.json', JSON.stringify(json, null, 4))
        console.log('Email Received:', json, parsed.text ? '\n'+parsed.text : '')

        if (parsed.attachments && parsed.attachments.length > 0) {
            const attDir = loc + '/attachments'
            fs.mkdirSync(attDir)
            parsed.attachments.forEach(att => {
                fs.writeFileSync(attDir + '/' + att.filename, att.content)
            })
        }
    } catch (err) {
        console.error("Failed to write email:", err)
    }
}

const server = new SMTPServer({
    secure: false,           // Don't use TLS
    authOptional: true,      // Don't require authentication
    disabledCommands: ['AUTH', 'STARTTLS'],  // Disable TLS entirely
    onData(stream, session, callback) {
        parser(stream, {}, (err, parsed) => {
            if (err) {
                console.log("Error:" , err)
                return callback(err)
            }
            
            writeEmail(parsed)
            callback()
        })
    }
});

server.listen(port, () => {
    console.log(`SMTP server listening on 0.0.0.0:${port}`)
})

const httpPort = 8085

// https://www.npmjs.com/package/express
const httpServer = express()

httpServer.get('/', (req, res) => {
    const dir = fs.readdirSync('./inbox')
    const emails = []
    for (const d of dir) {
        const meta = JSON.parse(fs.readFileSync('./inbox/'+d+'/meta.json'))
        emails.push(meta)
    }
    res.json(emails)
})

httpServer.get('/email/:id', (req, res) => {
    const id = req.params.id
    const fn = './inbox/'+msgId2Filename(id)
    if (!fs.existsSync(fn)) {
        res.status(404).json({ success: false, error: 'Email not found' })
        return
    }
    const meta = fs.readFileSync(fn+'/meta.json')
    const text = fs.readFileSync(fn+'/text.txt')
    let html = null
    if (fs.existsSync(fn+'/html.html')) {
        html = fs.readFileSync(fn+'/html.html')
    }
    const attachments = []
    const attDir = fn + '/attachments'
    if (fs.existsSync(attDir)) {
        const attFiles = fs.readdirSync(attDir)
        for (const af of attFiles) {
            const filename = af
            const content = fs.readFileSync(attDir + '/' + af)
            attachments.push({
                filename: filename,
                content: content.toString('base64')
            })
        }
    }
    res.json({
        id: id,
        meta: meta ? JSON.parse(meta) : null,
        text: text.toString(),
        html: html ? html.toString() : null,
        attachments: attachments
    })
})

httpServer.delete('/email/:id', (req, res) => {
    const id = req.params.id
    const dir = fs.readdirSync('./inbox')
    console.info('Deleting email id=',id)

    for (const d of dir) {
        const fn = './inbox/'+msgId2Filename(id)+'/meta.json'
        const meta = JSON.parse(fs.readFileSync(fn))
        console.info('Checking email id=',meta)
        if (meta.id === id) {
            fs.rmSync('./inbox/'+d, { recursive: true, force: true })
            res.json({ success: true })
            return
        }
    }
    res.status(404).json({ success: false, error: 'Email not found' })
})

httpServer.delete('/emails', (req, res) => {
    const dir = fs.readdirSync('./inbox')
    for (const d of dir) {
        fs.rmSync('./inbox/'+d, { recursive: true, force: true })
    }
    res.json({ success: true })
})

httpServer.use((req, res) => {
    res.status(404).json({ success: false, error: 'Not found' })
})

httpServer.listen(httpPort, '0.0.0.0', () => {
    console.log(`HTTP server listening on 0.0.0.0:${httpPort}`)
})


