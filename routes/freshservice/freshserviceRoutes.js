import express from 'express'
import { protect } from '../../middleware/authMiddleware.js'
import {
    createTicket,
    getTickets,
    addComment,
    updateTicket
} from '../../controllers/freshservice/freshserviceController.js'

const router = express.Router()

router.route('/tickets').get(getTickets)
router.route('/tickets').post(createTicket)
router.route('/addComment').post(addComment)
router.route('/updateTicket').post(updateTicket)
// router.route('/:id/reviews').post(protect, createProductReview)
// router.get('/top', getTopProducts)
// router
//     .route('/:id')
//     .get(getProductById)
//     .delete(protect, deleteProduct)
//     .put(protect, updateProduct)

export default router
