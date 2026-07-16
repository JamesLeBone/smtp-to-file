import express, { Request, Response } from 'express'
import { readMetaById, readEmailFile, list, readAttachments, deleteEmail } from './services/fio'
// types
import type { EmailMeta, attachment } from './services/fio'

interface EmailDetails extends EmailMeta {
    text?: string
    html?: string
    attachments: attachment[]
}
// Funcs

function determineHttpPort() {
    const defaultPort = 8085
    if (!process.env.HTTP_PORT) return defaultPort
    const parsed = Number.parseInt(process.env.HTTP_PORT)
    if (Number.isNaN(parsed) || parsed < 1) {
        console.warn(`Invalid HTTP port supplied, using default ${defaultPort}`)
        return defaultPort
    }
    return parsed
}
const httpPort = determineHttpPort()

const sendError = (reply: string, res: Response, statusCode=400): void => {
    res.status(statusCode).json({
        success:false,
        error:reply
    })
}
const sendSuccess = (reply: object | string, res:Response, statusCode=200): void => {
    res.status(statusCode).json({
        success: true,
        message: reply
    })
}

const readId = (req: Request) : string | undefined => {
    if (!req.params.id || typeof req.params.id !== 'string' || req.params.id.trim().length == 0) {
        return undefined
    }
    return req.params.id.trim()
}

// Express paths

const httpServer = express()

httpServer.get('/', (_req: Request, res: Response) => {
    const emails: EmailMeta[] = list()
    sendSuccess(emails, res)
})

httpServer.get('/email/:id', (req: Request, res: Response) => {
    const id = readId(req)
    if (!id) return sendError('Email id required', res)
    
    console.info('Fetching email id=', id)

    const meta = readMetaById(id)
    if (!meta) {
        return sendError('Not found',res,404)
    }

    const result: EmailDetails = {
        ...meta,
        attachments: []
    }

    result.text = readEmailFile(id, 'text')
    result.html = readEmailFile(id, 'html')
    result.attachments = readAttachments(id)

    res.json(result)
})

httpServer.delete('/email/:id', (req: Request, res: Response) => {
    const id = readId(req)
    if (!id) return sendError('Email id required',res)
    
    const result = deleteEmail(id)
    if (result) {
        return sendSuccess('Deleted successfully', res)
    }
    return sendError(
        'Failed to delete email', res, 500
    )
})

httpServer.delete('/emails', (_req: Request, res: Response) => {
    const dir = list()
    const tally: {id:string,result:boolean}[] = []
    for (const d of dir) {
        const id = d.id
        const result = deleteEmail(id)
        tally.push({id,result})
    }
    sendSuccess(tally,res)
})

httpServer.use((_req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'Not found' })
})

// Start
export default function HttpServer() {
    httpServer.listen(httpPort, '0.0.0.0', () => {
        console.log(`HTTP server listening on 0.0.0.0:${httpPort}`)
    })
}

