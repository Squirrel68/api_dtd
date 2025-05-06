import express from 'express'
import cors from 'cors'
import chalk from 'chalk'
import helmet from 'helmet'
import { connectMongoDB } from './database/database'
import adminRoutes from './routes/admin/index.route'
import commonRoutes from './routes/common/index.route'
import userRoutes from './routes/user/index.route'
import { responseError } from './utils/response'
import { FOLDERS, FOLDER_UPLOAD, ROUTE_IMAGE } from './constants/config'
import path from 'path'
import { isProduction } from './utils/helper'
require('dotenv').config()

const app: express.Application = express()
connectMongoDB()
const routes = [{ ...commonRoutes }, { ...userRoutes }, { ...adminRoutes }]
app.use(helmet())
app.use(cors())

// Request logging middleware - add this before parsing JSON
app.use((req, res, next) => {
  const startTime = new Date()
  const requestId = Math.random().toString(36).substring(2, 15)

  console.log(
    chalk.blue('📥 REQUEST:'),
    chalk.cyan(`[${requestId}]`),
    chalk.blue(`${req.method} ${req.originalUrl}`)
  )
  console.log(chalk.gray(`Time: ${startTime.toISOString()}`))

  // Log request headers if needed (commented out as it can be verbose)
  // console.log(chalk.gray(`Headers: ${JSON.stringify(req.headers, null, 2)}`))

  // Only log body for non-GET requests and if body exists
  if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
    // Mask sensitive data like passwords
    const safeBody = { ...req.body }
    if (safeBody.password) safeBody.password = '******'
    if (safeBody.token) safeBody.token = '******'

    console.log(chalk.gray(`Body: ${JSON.stringify(safeBody, null, 2)}`))
  }

  // Capture response to log it after completion
  const originalSend = res.send
  res.send = function (data) {
    const responseTime = new Date().getTime() - startTime.getTime()

    // Log the result
    console.log(
      chalk.green('📤 RESPONSE:'),
      chalk.cyan(`[${requestId}]`),
      chalk.green(`${req.method} ${req.originalUrl}`)
    )
    console.log(chalk.gray(`Status: ${res.statusCode}`))
    console.log(chalk.gray(`Time taken: ${responseTime}ms`))

    // Log response body if not too large (e.g., image data)
    try {
      const parsedData = JSON.parse(data)
      // Only log response data if not too large
      const dataSize = JSON.stringify(parsedData).length
      if (dataSize < 1000) {
        // For success responses, just log message or brief summary
        if (res.statusCode < 400) {
          console.log(
            chalk.gray(
              `Response: ${JSON.stringify(parsedData.message || 'Success')}`
            )
          )
        } else {
          // For error responses, log more details
          console.log(
            chalk.yellow(`Response: ${JSON.stringify(parsedData, null, 2)}`)
          )
        }
      } else {
        console.log(
          chalk.gray(`Response: [Large response data: ${dataSize} bytes]`)
        )
      }
    } catch (e) {
      // Not JSON data or error parsing
      const isLargeResponse = data?.length > 1000
      console.log(
        chalk.gray(
          `Response: [${
            isLargeResponse ? 'Large non-JSON data' : 'Non-JSON data'
          }]`
        )
      )
    }

    console.log(chalk.gray('----------------------------------------'))
    return originalSend.call(this, data)
  }

  next()
})

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check route
app.get('/health', (req, res) => {
  const healthcheck = {
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  }

  res.status(200).json(healthcheck)
})

const dirNameWithEnv = isProduction ? path.dirname(__dirname) : __dirname

const handlerImage: any = Object.values(FOLDERS).reduce(
  (result: any, current: any) => {
    return [
      ...result,
      express.static(path.join(dirNameWithEnv, `/${FOLDER_UPLOAD}/${current}`)),
    ]
  },
  [express.static(path.join(dirNameWithEnv, `/${FOLDER_UPLOAD}`))]
)

app.use(`/${ROUTE_IMAGE}`, ...handlerImage)

routes.forEach((item) =>
  item.routes.forEach((route) => app.use(item.prefix + route.path, route.route))
)

// Enhanced error handling middleware (just keep one version)
app.use(function (err: any, req: any, res: any, next: any) {
  console.error(chalk.red('❌ SERVER ERROR:'))
  console.error(chalk.red('Time:'), new Date().toISOString())
  console.error(chalk.red('Request URL:'), req.originalUrl)
  console.error(chalk.red('Request Method:'), req.method)
  console.error(chalk.red('Error Message:'), err.message)
  console.error(chalk.red('Error Stack:'), err.stack)

  // Optional: Log request body (may contain sensitive info)
  if (process.env.NODE_ENV !== 'production') {
    console.error(
      chalk.yellow('Request Body:'),
      JSON.stringify(req.body, null, 2)
    )
  }

  console.error(chalk.red('--------------------------------------'))

  // Use the existing error response handler
  responseError(res, err)
})

app.listen(process.env.PORT, function () {
  console.log(chalk.greenBright(`API listening on port ${process.env.PORT}!`))
})
