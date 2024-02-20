import { Router } from 'express'

import {
    createJiraIssue,
    getIssueAttachments,
    updateIssueStatue,
    addComment,
    attachAttachment,
    checkFile,
    updateJiraIssue,
} from '../../controllers/jira/jiraController.js'

const router = Router()

router.post('/createJiraIssue', createJiraIssue)
router.post('/updateJiraIssue', updateJiraIssue)

router.get('/getIssueAttachments', getIssueAttachments)
router.get('/checkfile', checkFile)

router.post('/updateIssueStatue', updateIssueStatue)
router.post('/addComment', addComment)
router.post('/attachAttachment', attachAttachment)


export default router
