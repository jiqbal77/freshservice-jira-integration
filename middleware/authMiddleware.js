import asyncHandler from 'express-async-handler'
const protect = asyncHandler(async (req, res, next) => {
    let apikey

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Basic')
    ) {
        try {
            apikey = req.headers.authorization.split(' ')[1]
            next()
        } catch (error) {
            res.status(401)
            throw new Error('Not authorized, api-key exists but failed.')
        }
    }

    if (!apikey) {
        res.status(401)
        throw new Error('Not Authorized, no api-key found.')
    }
})

export { protect }
