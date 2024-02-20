import asyncHandler from 'express-async-handler'
import axios, { Axios } from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import ID_data from '../../models/ID_data.js'
import path from 'path'
import { dirname } from 'path'
import { generateUrl } from '../../utils/generateUrl.js'
import cheerio from 'cheerio'
import jsdom from 'jsdom'

const getJiraHeaders = () => {
    return {
        'Authorization': `Basic ${Buffer.from(
            `${process.env.JIRA_EMAIL}:${process.env.JIRA_TOKEN}`
        ).toString('base64')}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        //'Content-Type': 'multipart/form-data',

        'X-Atlassian-Token': 'nocheck', // To bypass XSRF protection
    }
}
// getting headers
const getFreshserviceHeaders = (apikey) => {
    return {
        Authorization: `Basic ${apikey}`,
        'Content-Type': 'application/json',
    }
}

const createJiraIssue = asyncHandler(async (req, res) => {
    const ticket = req.body.freshdesk_webhook.id_numeric
    const issueData = await ID_data.findOne({ freshServiceID: ticket })
    //console.log('I am creating ticket in freshservice again')
    if (!issueData) {
        const apikey = Buffer.from(process.env.FRESHSERVICE_APIKEY).toString(
            'base64'
        )
        const dirPath = path.join(path.resolve(), `/controllers/jira/files`)
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true })
        }

        const dom = new jsdom.JSDOM(req.body.freshdesk_webhook.ticket_description)
        const attachmentsArr = []

        dom.window.document?.querySelectorAll('a')?.forEach((element) => {
            attachmentsArr.push({
                id: element.href.split('attachments/')[1],
                name: element.innerHTML,
            })
        })


        // saving attachments files if exist
        const promises = Promise.all(
            attachmentsArr.map(async (element, i) => {
                let promise = new Promise(function (resolve, reject) {
                    // axios image download with response type "stream"
                    axios({
                        method: 'GET',
                        url: `${generateUrl(process.env.FRESHSERVICE_DOMAIN_PREFIX)}/attachments/${element.id}`,
                        responseType: 'stream',
                        headers: getFreshserviceHeaders(apikey),
                    })
                        .then((response) => {
                            const filename = attachmentsArr[i].name.replace(
                                /\s/g,
                                ''
                            )
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
                                        `/controllers/jira/files/${filename}`
                                    )

                                    const stats = fs.statSync(pathname)
                                    const fileSizeInBytes = stats.size
                                    const fileStream =
                                        fs.createReadStream(pathname)

                                    resolve(pathname)

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
                const html = req.body.freshdesk_webhook.ticket_description
                // Use a regular expression to extract text between inner <div> tags
                const regex = /<div>(.*?)<\/div>/i
                const match = html.match(regex)
                var innerDivText = ''
                if (match && match.length > 1) {
                    innerDivText = match[1].trim()
                    //console.log(innerDivText)
                } else {
                    const inputText = req.body.freshdesk_webhook.ticket_description
                    // Find the index of the first newline character to split the text
                    const newlineIndex = inputText.indexOf('\n');
                    if (newlineIndex !== -1) {
                        // Extract the text before the first newline
                        innerDivText = inputText.substring(0, newlineIndex).trim();
                    }
                    else{
                        innerDivText = req.body.freshdesk_webhook.ticket_description
                        //console.log('Inner div not found.')
                    }
                }

                var status_id = '11'
                if (req.body.freshdesk_webhook.ticket_status === 'Pending') {
                    status_id = '21'
                } else if (
                    req.body.freshdesk_webhook.ticket_status === 'Resolved' ||
                    req.body.freshdesk_webhook.ticket_status === 'Closed'
                ) {
                    status_id = '31'
                }
                var priority = req.body.freshdesk_webhook.ticket_priority
                var priority_id = 2
                if (priority === 'Low') {
                    priority_id = 1
                } else if (priority === 'Medium') {
                    priority_id = 3
                } else if (priority === 'High') {
                    priority_id = 4
                } else if (priority === 'Urgent') {
                    priority_id = 5
                }
                const jiraIssueData = {
                    fields: {
                        project: {
                            key: 'IN2',
                        },
                        summary: req.body.freshdesk_webhook.ticket_subject,
                        description: innerDivText,
                        issuetype: {
                            id: 10004,
                        },
                    },
                    transition: {
                        id: status_id,
                    },
                    priority: {
                        id: priority_id,
                    },
                }

                axios
                    .post(
                        process.env.JIRA_URL + '/issue',
                        jiraIssueData,
                        {
                            headers: getJiraHeaders(),
                        }
                    )
                    .then((response) => {
                        const data = new ID_data({
                            jiraIssueID: response.data.id,
                            freshServiceID:
                                req.body.freshdesk_webhook.id_numeric,
                        })
                        data.save()
                        //console.log(response.data)
                        res.status(response.status).json(response.data)
                        /////

                        resp.forEach((i) => {
                            //console.log('iiiiii'.bgCyan, i)

                            const form = new FormData()

                            const stats = fs.statSync(i)
                            const fileSizeInBytes = stats.size
                            const fileStream = fs.createReadStream(i)

                            form.append('file', fileStream, {
                                knownLength: fileSizeInBytes,
                            })

                            axios
                                .post(
                                    process.env.JIRA_URL + '/issue/' +
                                        response.data.id +
                                        '/attachments',
                                    form,
                                    {
                                        headers: {
                                            'Authorization': `Basic ${Buffer.from(
                                                `${process.env.JIRA_EMAIL}:${process.env.JIRA_TOKEN}`
                                            ).toString('base64')}`,
                                            'Accept': 'application/json',
                                            'Content-Type': 'multipart/form-data',
                                            'X-Atlassian-Token': 'nocheck', // To bypass XSRF protection
                                        },
                                    }
                                )
                                .then((response) => {})
                                .catch((err) => {
                                    console.log(err)
                                })
                        })
                    })
                    .catch((err) => {
                        console.log(
                            'error in creating jira issue'.bgRed,
                            err.response.data,
                            err.response
                        )
                    })
            })
            .catch((err) => {
                console.log(
                    'error in promised returned catch jira controller'.bg,
                    err
                )
            })
    } else {
        console.log('Ticket has already been created')
    }
})
const updateJiraIssue = asyncHandler(async (req, res) => {

    //console.log(req.body)
    
    const apikey = Buffer.from(process.env.FRESHSERVICE_APIKEY).toString(
        'base64'
    )

    //console.log('I am updating ticket in jira')
    const id = req.body.freshdesk_webhook.id_numeric
    const issueData = await ID_data.findOne({ freshServiceID: id })
    //console.log('Data:' + issueData.jiraIssueID)

    if(!(issueData.updated)){
        // making updated field true to prevent loop
        issueData.updated = true
        await issueData.save()
        //------------------------------------------

        //deleting existing attachments first
        await deleteAllAttachments(issueData.jiraIssueID)
        //------------------------------------------

        // Actual update code started from here
        //------------------------------------------

        const issueId = issueData.jiraIssueID
        const dirPath = path.join(path.resolve(), `/controllers/jira/files`)
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true })
        }
    
        const dom = new jsdom.JSDOM(req.body.freshdesk_webhook.ticket_description)
        const attachmentsArr = []
    
        dom.window.document?.querySelectorAll('a')?.forEach((element) => {
            attachmentsArr.push({
                id: element.href.split('attachments/')[1],
                name: element.innerHTML,
            })
        })
    
        if (!false) {
            // saving attachments files if exist
            const promises = Promise.all(
                attachmentsArr.map(async (element, i) => {
                    let promise = new Promise(function (resolve, reject) {
                        // axios image download with response type "stream"
                        axios({
                            method: 'GET',
                            url: `${generateUrl(process.env.FRESHSERVICE_DOMAIN_PREFIX)}/attachments/${element.id}`,
                            responseType: 'stream',
                            headers: getFreshserviceHeaders(apikey),
                        })
                            .then((response) => {
                                const filename = attachmentsArr[i].name.replace(
                                    /\s/g,
                                    ''
                                )
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
                                            `/controllers/jira/files/${filename}`
                                        )
    
                                        const stats = fs.statSync(pathname)
                                        const fileSizeInBytes = stats.size
                                        const fileStream =
                                            fs.createReadStream(pathname)
    

                                        resolve(pathname)
    

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
                    const html = req.body.freshdesk_webhook.ticket_description
                    // Use a regular expression to extract text between inner <div> tags
                    const regex = /<div>(.*?)<\/div>/i
                    const match = html.match(regex)
                    var innerDivText = ''
                    if (match && match.length > 1) {
                        innerDivText = match[1].trim()
                        //console.log(innerDivText)
                    } else {
                        const inputText = req.body.freshdesk_webhook.ticket_description
                        // Find the index of the first newline character to split the text
                        const newlineIndex = inputText.indexOf('\n');
                        if (newlineIndex !== -1) {
                            // Extract the text before the first newline
                            innerDivText = inputText.substring(0, newlineIndex).trim();
                        }
                        else{
                            innerDivText = req.body.freshdesk_webhook.ticket_description
                            //console.log('Inner div not found.')
                        }
                    }
    
                    var status_id = '11'
                    if (req.body.freshdesk_webhook.ticket_status === 'Pending') {
                        status_id = '21'
                    } else if (
                        req.body.freshdesk_webhook.ticket_status === 'Resolved' ||
                        req.body.freshdesk_webhook.ticket_status === 'Closed'
                    ) {
                        status_id = '31'
                    }
                    var priority = req.body.freshdesk_webhook.ticket_priority
                    var priority_id = 2
                    if (priority === 'Low') {
                        priority_id = 1
                    } else if (priority === 'Medium') {
                        priority_id = 3
                    } else if (priority === 'High') {
                        priority_id = 4
                    } else if (priority === 'Urgent') {
                        priority_id = 5
                    }
                    const jiraIssueData = {
                        fields: {
                            project: {
                                key: 'IN2',
                            },
                            summary: req.body.freshdesk_webhook.ticket_subject,
                            description: innerDivText,
                            issuetype: {
                                id: 10004,
                            },
                        },
                        priority: {
                            id: priority_id,
                        },
                    }
                    //console.log(jiraIssueData)
                    updateIssueStatue(issueId, status_id)
                    axios
                        .put(
                            process.env.JIRA_URL + '/issue/' + issueId ,
                            jiraIssueData,
                            {
                                headers: getJiraHeaders(),
                            }
                        )
                        .then((response) => {
                            //console.log(response.data)
                            //console.log("Updated................")
                            res.status(response.status).json(response.data)
                            /////
    
                            resp.forEach((i) => {
                                //console.log('iiiiii'.bgCyan, i)
    
                                const form = new FormData()
    
                                const stats = fs.statSync(i)
                                const fileSizeInBytes = stats.size
                                const fileStream = fs.createReadStream(i)
    
                                form.append('file', fileStream, {
                                    knownLength: fileSizeInBytes,
                                })
    
                                axios
                                    .post(
                                        process.env.JIRA_URL + '/issue/' +
                                        issueId +
                                            '/attachments',
                                        form,
                                        {
                                            headers: {
                                                'Authorization': `Basic ${Buffer.from(
                                                    `${process.env.JIRA_EMAIL}:${process.env.JIRA_TOKEN}`
                                                ).toString('base64')}`,
                                                'Accept': 'application/json',
                                                'Content-Type': 'multipart/form-data',
                                                'X-Atlassian-Token': 'nocheck', // To bypass XSRF protection
                                            }
                                        }
                                    )
                                    .then((response) => {})
                                    .catch((err) => {
                                        console.log(err)
                                    })
                            })
                        })
                        .catch((err) => {
                            console.log(
                                'error in creating jira issue'.bgRed,
                                err.response.data,
                                err.response
                            )
                        })
                })
                .catch((err) => {
                    console.log(
                        'error in promised returned catch jira controller'.bg,
                        err
                    )
                })
        } else {
            console.log('Ticket has already been updated')
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

async function deleteAllAttachments(issueKey) {
    try {
        // Step 1: Fetch issue attachments
        const IssueAttachments = await getIssueAttachments(issueKey)

        //console.log(IssueAttachments)

        // Step 2: Delete each attachment
        for (const attachment of IssueAttachments) {
            await axios.delete(`${process.env.JIRA_URL}/attachment/${attachment.id}`, {
                headers: getJiraHeaders(),
            });
            //console.log(`Deleted attachment with ID: ${attachment.id}`);
        }

        //console.log('All attachments deleted successfully.');
    } catch (error) {
        console.log('Error deleting attachments:', error);
    }
}

async function getIssueAttachments(issueID) {
    var attachments = []
    await axios
        .get(
            process.env.JIRA_URL + '/issue/' +
            issueID,
            {
                headers: getJiraHeaders(),
            }
        )
        .then((response) => {
            attachments = (response.data.fields.attachment)
        })
        .catch((err) => {
            console.log(err)
        })

    return attachments
}

const updateIssueStatue = asyncHandler(async (issueID, transitionID) => {

    console.log("Status update of ID:" + issueID + " to transition ID : " + transitionID)
    const bodyData = {
        transition: {
            id: transitionID,
        },
    }

    axios
        .post(
            process.env.JIRA_URL + '/issue/' +
            issueID +
                '/transitions',
            JSON.stringify(bodyData),
            {
                headers: getJiraHeaders(),
            }
        )
        .then((response) => {
            return {
                status:response.status,
                data: response.data
            }
        })
        .catch((err) => {
            console.log(err)
        })
})

const createCustomField = asyncHandler(async (req, res) => {
    const bodyData = {
        description: 'Custom field for picking groups',
        name: 'New custom field',
        searcherKey:
            'com.atlassian.jira.plugin.system.customfieldtypes:grouppickersearcher',
        type: 'com.atlassian.jira.plugin.system.customfieldtypes:grouppicker',
    }

    axios
        .post(
            process.env.JIRA_URL + '/field',
            JSON.stringify(bodyData),
            {
                headers: getJiraHeaders(),
            }
        )
        .then((response) => {
            res.status(response.status).json(response.data)
        })
        .catch((err) => {
            console.log(err)
        })
})

const addComment = asyncHandler(async (req, res) => {
    const id = req.body.freshdesk_webhook.id_numeric
    const issueData = await ID_data.findOne({ freshServiceID: id })
    let comment = await getLastComment(issueData.jiraIssueID)
    // Your HTML code
    const html = req.body.freshdesk_webhook.ticket_latest_public_comment
    // Use a regular expression to extract text between inner <div> tags
    const regex = /<div>(.*?)<\/div>/i
    const match = html.match(regex)
    var innerDivText = ''
    if (match && match.length > 1) {
        innerDivText = match[1].trim()
        //console.log(innerDivText)
    } else {
        innerDivText = html
        console.log('Inner div not found.')
    }

    if(comment != innerDivText){
        const bodyData = {
            body: innerDivText,
        }
    
        axios
            .post(
                process.env.JIRA_URL + '/issue/' +
                    issueData.jiraIssueID +
                    //req.query.id +
                    '/comment',
                JSON.stringify(bodyData),
                {
                    headers: getJiraHeaders(),
                }
            )
            .then((response) => {
                //console.log(response.data)
                res.status(response.status).json(response.data)
            })
            .catch((err) => {
                console.log(err)
            })
    }

})

async function getLastComment(issueKey) {
    try {
        // Step 1: Fetch issue comments
            const response = await axios.get(`${process.env.JIRA_URL}/issue/${issueKey}/comment`, {
                headers: getJiraHeaders()
            });

        const comments = response.data.comments;

        // Step 2: Get the last comment
        const lastComment = comments[comments.length - 1];

        return lastComment.body
    } catch (error) {
        console.error('Error fetching last comment:', error);
    }
}
  



const attachAttachment = asyncHandler(async (req, res) => {
    const filePath =
        '/Users/apple/Desktop/freshservice_jira/controllers/jira/myfile.txt'
    const form = new FormData()
    const stats = fs.statSync(filePath)
    const fileSizeInBytes = stats.size
    const fileStream = fs.createReadStream(filePath)

    form.append('file', fileStream, { knownLength: fileSizeInBytes })

    axios
        .post(
            process.env.JIRA_URL + '/issue/' +
                req.query.id +
                '/attachments',
            form,
            {
                headers: getJiraHeaders(),
            }
        )
        .then((response) => {
            res.status(response.status).json(response.data)
        })
        .catch((err) => {
            console.log(err)
        })

})


import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
async function downloadImage(url) {
    // axios image download with response type "stream"
    const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        headers: getJiraHeaders(),
    })

    // getting filename from responseurl
    const filename = response.data.responseUrl.split('name=')[1]
    const filepath = path.resolve(__dirname, 'images', filename)

    // pipe the result stream into a file on disc
    response.data.pipe(fs.createWriteStream(filepath))

    // return a promise and resolve when download finishes
    return new Promise((resolve, reject) => {
        response.data.on('end', () => {
            resolve('hi')
        })

        response.data.on('error', () => {
            reject()
        })
    })
}
const checkFile = asyncHandler(async (req, res) => {

    const data = await downloadImage(
        process.env.JIRA_URL + '/attachment/content/10021'
    )
    console.log('DATA ', data)
})

export {
    createJiraIssue,
    getIssueAttachments,
    updateIssueStatue,
    addComment,
    attachAttachment,
    checkFile,
    updateJiraIssue,
}
