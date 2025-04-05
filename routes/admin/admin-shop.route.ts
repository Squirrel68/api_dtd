import { Router } from 'express'
import shopController from '../../controllers/shop.controller'
import authMiddleware from '../../middleware/auth.middleware'
import { wrapAsync } from '../../utils/response'

const shopRouter = Router()

// Create a shop for the logged-in user
shopRouter.post(
  '/',
  authMiddleware.verifyAccessToken,
  wrapAsync(shopController.createShop)
)

// Get shop information of the logged-in user
shopRouter.get(
  '/me',
  authMiddleware.verifyAccessToken,
  wrapAsync(shopController.getShop)
)

// Get shop information of any user by ID
shopRouter.get('/:user_id', wrapAsync(shopController.getShop))

// Update shop information of the logged-in user
shopRouter.put(
  '/',
  authMiddleware.verifyAccessToken,
  wrapAsync(shopController.updateShop)
)

export default shopRouter
