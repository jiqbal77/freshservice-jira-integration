import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import mongoose from 'mongoose'
import { urlencoded } from 'express'
import { notFound, errorHandler } from './middleware/errorMiddleware.js'
import freshserviceRoutes from './routes/freshservice/freshserviceRoutes.js'
import jiraRoutes from './routes/jira/jiraRoutes.js'
import colors from 'colors'

const app = express()
app.use(cors())
dotenv.config()

// for accepting Body from Json
app.use(express.json())

// freshservice routes
app.use('/api/freshservice', freshserviceRoutes)

// jira routes
app.use('/api/jira', jiraRoutes)

// 404
app.use(notFound)
// error middleware
app.use(errorHandler)
app.use(urlencoded({ extended: false }))

const PORT = process.env.PORT || 5000

mongoose.set('strictQuery', false)

mongoose
    .connect(
        process.env.NODE_ENV === 'development'
            ? process.env.MONGO_URI_DEVELOPMENT
            : process.env.MONGO_URI_PRODUCTION,
        { useNewUrlParser: true, useUnifiedTopology: true }
    )
    .then((result) => {
        app.listen(
            PORT,
            console.log(
                `Server running in ${process.env.NODE_ENV} on port ${PORT} and database is connected`
                    .yellow.bold
            )
        )
    })
    .catch((err) => console.log(err))
