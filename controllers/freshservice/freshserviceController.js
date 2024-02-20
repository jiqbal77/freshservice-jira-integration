import asyncHandler from 'express-async-handler'
import colors from 'colors'
import { generateUrl } from '../../utils/generateUrl.js'
import axios from 'axios'
import fs from 'fs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { rimraf } from 'rimraf'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
import ID_data from '../../models/ID_data.js'

import { response } from 'express'
import path from 'path'
import { Readable } from 'stream'
import { error } from 'console'

// getting headers
const getFreshserviceHeaders = (apikey, contentType) => {
    return {
        'Authorization': `Basic ${apikey}`,
        'Content-Type': 'application/json',
        //'Content-Type': 'multipart/form-data',
    }
}

const getJiraHeaders = () => {
    return {
        'Authorization': `Basic ${Buffer.from(
            `${process.env.JIRA_EMAIL}:${process.env.JIRA_TOKEN}`
        ).toString('base64')}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Atlassian-Token': 'nocheck', // To bypass XSRF protection
    }
}

// @desc   Fetch all tickets
// @route   GET /api/tickets
// @access   private
const getTickets = asyncHandler(async (req, res) => {
    const apikey = Buffer.from(process.env.FRESHSERVICE_APIKEY).toString(
        'base64'
    )

    axios
        .get(`${generateUrl(process.env.FRESHSERVICE_DOMAIN_PREFIX)}/ticket_form_fields`, {
            headers: getFreshserviceHeaders(apikey),
        })
        .then((response) => {
            res.json(response.data)
        })
        .catch((error) => {
            res.status(400).json({
                error,
            })
        })
})


// Adding comment/note to the ticket when the corresponding jira issue commented 
const addComment = asyncHandler(async (req, res) => {
    const jirra_id = req.body.issue.id
    const issueData = await ID_data.findOne({ jiraIssueID: jirra_id })
    //console.log(issueData)
    const comment = await getLastComment(issueData.freshServiceID)
    //console.log(comment)

    if(comment != req.body.comment.body)
    {
        const apikey = Buffer.from(process.env.FRESHSERVICE_APIKEY).toString(
            'base64'
        )
        const id = issueData.freshServiceID
        const bodyData = {
            body: req.body.comment.body,
            private: false,
        }
        axios
            .post(
                `${generateUrl(process.env.FRESHSERVICE_DOMAIN_PREFIX)}/tickets/${id}/notes`,
                bodyData,
                {
                    headers: getFreshserviceHeaders(apikey),
                }
            )
            .then((response) => {
                res.json(response.data)
            })
            .catch((error) => {
                console.log(error)
                res.status(400).json(error)
            })
    }

})


// getting last comment on ticket
async function getLastComment(ticketId) {
    const apikey = Buffer.from(process.env.FRESHSERVICE_APIKEY).toString(
        'base64'
    )
    try {
        // Step 1: Fetch ticket notes (comments)
            const response = await axios.get(`${generateUrl(process.env.FRESHSERVICE_DOMAIN_PREFIX)}/tickets/${ticketId}/conversations`, {
                headers: getFreshserviceHeaders(apikey),
            });
        
            const notes = response.data.conversations;
        
            // Step 2: Get the last note (comment)
            const lastNote = notes[notes.length - 1];
            //console.log(response)
            return (lastNote.body_text)
        } catch (error) {
            console.error('Error fetching last comment:', error.response ? error.response.data : error.message);
        }
  }
  

// @desc   craete a ticket
// @route   POST /api/tickets
// @access   private
const createTicket = asyncHandler(async (req, res) => {
    //console.log(req.body)
    //console.log('I am creating issue in jira again')
    const id = req.body.id
    const issueData = await ID_data.findOne({ jiraIssueID: id })
    //console.log("Data:" + issueData)
    if (!issueData) {
        const apikey = Buffer.from(process.env.FRESHSERVICE_APIKEY).toString(
            'base64'
        )
        const formdata = new FormData()
        const dirPath = path.join(
            path.resolve(),
            `/controllers/freshservice/files`
        )
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true })
        }

        if (req.body?.fields) {
            const promises = Promise.all(
                req.body.fields.attachment.map(async (element, i) => {
                    let promise = new Promise(function (resolve, reject) {
                        // axios image download with response type "stream"
                        axios({
                            method: 'GET',
                            url: element.content,
                            responseType: 'stream',
                            headers: getJiraHeaders(),
                        })
                            .then((response) => {
                                const filename = req.body.fields.attachment[
                                    i
                                ].filename.replace(/\s/g, '')
                                const filepath = path.resolve(
                                    __dirname,
                                    'files',
                                    filename
                                )
                                const writer = fs.createWriteStream(filepath)

                                response.data.pipe(writer)
                                let error = null
                                writer.on('error', (err) => {
                                    error = err
                                    writer.close()
                                })
                                writer.on('close', () => {
                                    if (!error) {
                                        const pathname = path.join(
                                            path.resolve(),
                                            `/controllers/freshservice/files/${filename}`
                                        )

                                        // let buffer = fs.readFileSync(pathname)
                                        fs.readFile(pathname, (err, buffer) => {
                                            let blob = new Blob([buffer])

                                            formdata.append(
                                                'attachments[]',
                                                blob,
                                                filename
                                            )
                                            resolve(i)
                                        })
                                    }
                                })

                
                            })
                            .catch((err) => {
                                console.log('error'.bgRed, err)
                                reject(err)
                            })
                    })
                    return promise
                })
            )

            promises
                .then((resp) => {
                    // step1 => downloading attachments if any

                    // step3 => mapping remaining feilds
                    let ticketPriority = req.body.fields.priority.id
                    if (ticketPriority != 1) {
                        ticketPriority = ticketPriority - 1
                    }
                    let status = req.body.fields.status.name
                    let status_id = 4
                    if (status === 'To Do') {
                        status_id = 2
                    } else if (status === 'In Progress') {
                        status_id = 3
                    } else if (status === 'Done') {
                        status_id = 5
                    }
                    formdata.append('description', req.body.fields.description)
                    formdata.append('subject', req.body.fields.summary)
                    formdata.append('priority', ticketPriority)
                    formdata.append('status', status_id)
                    formdata.append('workspace_id', 2)
                    formdata.append('requester_id', 23000998869)

                    axios
                        .post(
                            `${generateUrl(process.env.FRESHSERVICE_DOMAIN_PREFIX)}/tickets`,
                            formdata,
                            {
                                headers: {
                                    'Authorization': `Basic ${apikey}`,
                                    //'Content-Type': 'application/json',
                                    'Content-Type': 'multipart/form-data',
                                }
                            }
                        )
                        .then((response) => {
                            const data = new ID_data({
                                jiraIssueID: req.body.id,
                                freshServiceID: response.data.ticket.id,
                            })
                            data.save()
                            res.json(response.data)
                            //console.log(response.data.ticket.attachments)
                            rimraf.sync(dirPath)
                        })
                        .catch((error) => {
                            res.status(401).json(error)
                        })
                })
                .catch((err) => {
                    console.log('error in promised returned catch'.bg, err)
                })
        } else {
        }
    } else {
        console.log('Ticket has already been created')
    }
})


const updateTicket = asyncHandler(async (req, res) => {
    //console.log(req.body)
    //console.log('I am Updating issue in fresh service')
    const id = req.body.id
    const issueData = await ID_data.findOne({ jiraIssueID: id })
    //console.log("Data:" + issueData)

    if(!(issueData.updated)){
        // making updated field true to prevent loop
        issueData.updated = true
        await issueData.save()
        //------------------------------------------

        //deleting existing attachments first
        await deleteAllAttachments(issueData.freshServiceID) 
        //------------------------------------------


        // Actual update code started from here
        //------------------------------------------

        const apikey = Buffer.from(process.env.FRESHSERVICE_APIKEY).toString(
            'base64'
        )
        const formdata = new FormData()
        const dirPath = path.join(
            path.resolve(),
            `/controllers/freshservice/files`
        )
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true })
        }
    
        if (req.body?.fields) {
            const promises = Promise.all(
                req.body.fields.attachment.map(async (element, i) => {
                    let promise = new Promise(function (resolve, reject) {
                        // axios image download with response type "stream"
                        axios({
                            method: 'GET',
                            url: element.content,
                            responseType: 'stream',
                            headers: getJiraHeaders(),
                        })
                            .then((response) => {
                                const filename = req.body.fields.attachment[
                                    i
                                ].filename.replace(/\s/g, '')
                                const filepath = path.resolve(
                                    __dirname,
                                    'files',
                                    filename
                                )
                                const writer = fs.createWriteStream(filepath)
    
                                response.data.pipe(writer)
                                let error = null
                                writer.on('error', (err) => {
                                    error = err
                                    writer.close()
                                })
                                writer.on('close', () => {
                                    if (!error) {
                                        const pathname = path.join(
                                            path.resolve(),
                                            `/controllers/freshservice/files/${filename}`
                                        )
    
                                        // let buffer = fs.readFileSync(pathname)
                                        fs.readFile(pathname, (err, buffer) => {
                                            let blob = new Blob([buffer])
    
                                            formdata.append(
                                                'attachments[]',
                                                blob,
                                                filename
                                            )
                                            resolve(i)
                                        })
                                    }
                                })
    
                            })
                            .catch((err) => {
                                console.log('error'.bgRed, err)
                                reject(err)
                            })
                    })
                    return promise
                })
            )
            promises
               .then((resp) => {
                    //step1 => downloading attachments if any
    
                    //step3 => mapping remaining feilds
                    //console.log('hello')
                    let ticketPriority = req.body.fields.priority.id
                    if (ticketPriority != 1) {
                        ticketPriority = ticketPriority - 1
                    }
                    let status = req.body.fields.status.name
                    let status_id = 4
                    if (status === 'To Do') {
                        status_id = 2
                    } else if (status === 'In Progress') {
                        status_id = 3
                    } else if (status === 'Done') {
                        status_id = 5
                    }
                    formdata.append('description', req.body.fields.description)
                    formdata.append('subject', req.body.fields.summary)
                    formdata.append('priority', ticketPriority)
                    formdata.append('status', status_id)
                    formdata.append('source', 2)
                    //formdata.append('workspace_id', 2)
                    //formdata.append('requester_id', 23000998869)
                    //console.log("Updating.............")
    
                    axios
                        .put(
                            `${generateUrl(process.env.FRESHSERVICE_DOMAIN_PREFIX)}/tickets/${issueData.freshServiceID}`,
                            formdata,
                            {
                                headers: {
                                    'Authorization': `Basic ${apikey}`,
                                    //'Content-Type': 'application/json',
                                    'Content-Type': 'multipart/form-data',
                                },
                            }
                        )
                        .then((response) => {
                            //console.log("Update Done")
                            res.json(response.data)
                            //console.log(response.data.ticket.attachments)
                            rimraf.sync(dirPath)
                        })
                        .catch((error) => {
                            console.log(error)
                            res.status(401).json(error)
                        })
                })
                .catch((err) => {
                    console.log('error in promised returned catch'.bg, err)
                })
        } else {
        }
    

    } else {
        console.log('Ticket has already been updated')
        // making updated field false to prevent loop
        // and again make it updatable for future
        issueData.updated = false
        await issueData.save()
        //------------------------------------------
    }
   
})

async function deleteAllAttachments(ticketId) {
    const apikey = Buffer.from(process.env.FRESHSERVICE_APIKEY).toString(
        'base64'
    )
    try {
        // Step 1: Fetch ticket attachments
        const attachments = await getTicketAttachments(ticketId);
        //console.log(attachments)
        //Step 2: Delete each attachment
        for (const attachment of attachments) {
            await axios.delete(`${generateUrl(process.env.FRESHSERVICE_DOMAIN_PREFIX)}/tickets/${ticketId}/attachments/${attachment.id}`, {
                headers: getFreshserviceHeaders(apikey),
            });
            //console.log(`Deleted attachment with ID: ${attachment.id}`);
        }

        //console.log('All attachments deleted successfully.');
    } catch (error) {
        console.error('Error deleting attachments:', error.response);
    }
}


async function getTicketAttachments(ticketId){
    const apikey = Buffer.from(process.env.FRESHSERVICE_APIKEY).toString(
        'base64'
    )
    var attachments = []

    await axios
        .get(`${generateUrl(process.env.FRESHSERVICE_DOMAIN_PREFIX)}/tickets/${ticketId}`, {
            headers:  getFreshserviceHeaders(apikey)
        })
        .then((response) => {
            attachments = (response.data.ticket.attachments)
        })
        .catch((error) => {
            console.log(error)
        })

    return attachments
}
  
  



export { getTickets, createTicket, addComment, updateTicket }
