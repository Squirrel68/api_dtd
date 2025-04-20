import { Router } from 'express'
import authMiddleware from '../../middleware/auth.middleware'
import orderController from '../../controllers/order.controller'
import { wrapAsync } from '../../utils/response'

export const userOrderRouter = Router()

// Tạo đơn hàng mới
userOrderRouter.post(
  '/',
  authMiddleware.verifyAccessToken,
  wrapAsync(orderController.createOrder)
)

// Xử lý thanh toán đơn hàng
userOrderRouter.post(
  '/:orderId/pay',
  authMiddleware.verifyAccessToken,
  wrapAsync(orderController.processPayment)
)

// // Lấy danh sách đơn hàng
// userOrderRouter.get(
//   '/',
//   authMiddleware.verifyAccessToken,
//   wrapAsync(orderController.getUserOrders)
// )

// // Lấy chi tiết đơn hàng
// userOrderRouter.get(
//   '/:order_id',
//   authMiddleware.verifyAccessToken,
//   wrapAsync(orderController.getOrderDetail)
// )

export default userOrderRouter
