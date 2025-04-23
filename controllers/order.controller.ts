import { Request, Response } from 'express'
import mongoose from 'mongoose'
import { OrderModel, OrderStatus } from '../database/models/order.model'
import { PurchaseModel } from '../database/models/purchase.model'
import { ProductModel } from '../database/models/product.model'
import { UserModel } from '../database/models/user.model'
import { ErrorHandler, responseSuccess } from '../utils/response'
import { STATUS } from '../constants/status'
import { STATUS_PURCHASE } from '../constants/purchase'
import { recurlyService } from '../utils/RecurlyService'

/**
 * Endpoint Tạo Order
 * POST /api/orders
 */
const createOrder = async (req: Request, res: Response) => {
  const userId = req.jwtDecoded.id
  const { purchase_ids, full_name, phone, address, note } = req.body

  // Validate input data
  if (
    !purchase_ids ||
    !purchase_ids.length ||
    !full_name ||
    !phone ||
    !address
  ) {
    throw new ErrorHandler(STATUS.BAD_REQUEST, 'Thiếu thông tin đơn hàng')
  }

  // Lấy thông tin user để lấy email
  const user = await UserModel.findById(userId)
  if (!user) {
    throw new ErrorHandler(
      STATUS.NOT_FOUND,
      'Không tìm thấy thông tin người dùng'
    )
  }

  // Lấy các sản phẩm từ giỏ hàng
  const purchases = await PurchaseModel.find({
    _id: { $in: purchase_ids },
    user: userId,
    status: STATUS_PURCHASE.IN_CART,
  }).populate('product')

  if (purchases.length === 0) {
    throw new ErrorHandler(
      STATUS.NOT_FOUND,
      'Không tìm thấy sản phẩm trong giỏ hàng'
    )
  }

  // Kiểm tra số lượng trong kho
  for (const purchase of purchases) {
    const product = purchase.product as any
    if (product.quantity < purchase.buy_count) {
      throw new ErrorHandler(
        STATUS.BAD_REQUEST,
        `Sản phẩm "${product.name}" chỉ còn ${product.quantity} trong kho`
      )
    }
  }

  // Tính tổng tiền
  const total_amount = purchases.reduce(
    (total, purchase) => total + purchase.price * purchase.buy_count,
    0
  )

  // Phí vận chuyển
  const shipping_fee = 30000 // VND

  try {
    // Tạo đơn hàng với trạng thái PENDING
    const newOrder = await OrderModel.create({
      user: userId,
      purchases: purchase_ids,
      full_name,
      phone,
      address,
      total_amount,
      shipping_fee,
      payment_method: 'recurly', // Mặc định là thanh toán qua Recurly
      status: OrderStatus.PENDING,
      note: note || '',
    })

    // Trả về thông tin đơn hàng cơ bản
    return responseSuccess(res, {
      message: 'Tạo đơn hàng thành công, chờ thanh toán',
      data: {
        orderId: newOrder._id,
        total_amount: newOrder.total_amount + newOrder.shipping_fee,
      },
    })
  } catch (error) {
    console.error('Create order error:', error)
    throw new ErrorHandler(STATUS.INTERNAL_SERVER_ERROR, 'Lỗi khi tạo đơn hàng')
  }
}

/**
 * Endpoint Xử lý Thanh toán
 * POST /api/orders/:orderId/pay
 */
const processPayment = async (req: Request, res: Response) => {
  const userId = req.jwtDecoded.id
  const { orderId } = req.params
  const { token_id } = req.body // token_id từ Recurly.js frontend

  // Validate orderId
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new ErrorHandler(STATUS.BAD_REQUEST, 'ID đơn hàng không hợp lệ')
  }

  // Tìm Order theo ID và xác thực quyền
  const order = await OrderModel.findOne({
    _id: orderId,
    user: userId,
    status: OrderStatus.PENDING,
    payment_method: 'recurly',
  })

  if (!order) {
    throw new ErrorHandler(
      STATUS.NOT_FOUND,
      'Không tìm thấy đơn hàng hoặc đơn hàng không ở trạng thái chờ thanh toán'
    )
  }

  // Lấy thông tin User
  const user = await UserModel.findById(userId)
  if (!user) {
    throw new ErrorHandler(
      STATUS.NOT_FOUND,
      'Không tìm thấy thông tin người dùng'
    )
  }

  try {
    // Xử lý thanh toán với Recurly
    const paymentResult = await recurlyService.processPayment(
      order,
      user,
      token_id // Chỉ truyền token nếu thanh toán bằng thẻ mới
    )

    if (paymentResult.success) {
      // Cập nhật đơn hàng khi thanh toán thành công
      order.status = OrderStatus.PAID
      order.paid_at = new Date()
      order.recurly_transaction_id = paymentResult.transaction_id
      order.recurly_account_id = paymentResult.account_id

      // Lưu response từ payment gateway
      if (paymentResult.response) {
        order.payment_gateway_response = JSON.stringify(paymentResult.response)
      }

      await order.save()

      // Cập nhật recurly_account_id trong User nếu chưa có
      if (
        paymentResult.account_id &&
        (!user.recurly_account_id ||
          user.recurly_account_id !== paymentResult.account_id)
      ) {
        user.recurly_account_id = paymentResult.account_id
        await user.save()
      }

      // Cập nhật trạng thái purchases và số lượng sản phẩm
      await PurchaseModel.updateMany(
        { _id: { $in: order.purchases } },
        { status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION }
      )

      // Lấy thông tin purchases để cập nhật số lượng sản phẩm
      const purchases = await PurchaseModel.find({
        _id: { $in: order.purchases },
      }).populate('product')

      // Cập nhật số lượng sản phẩm trong kho
      for (const purchase of purchases) {
        const product = purchase.product as any
        await ProductModel.findByIdAndUpdate(product._id, {
          $inc: {
            quantity: -purchase.buy_count,
            sold: purchase.buy_count,
            monthlySold: purchase.buy_count,
          },
        })
      }

      // Trả về kết quả thanh toán thành công
      return responseSuccess(res, {
        message: 'Thanh toán thành công',
        data: {
          orderId: order._id,
          status: order.status,
          transaction_id: paymentResult.transaction_id,
          paid_at: order.paid_at,
        },
      })
    } else {
      // Cập nhật đơn hàng khi thanh toán thất bại
      order.status = OrderStatus.PAYMENT_FAILED
      order.payment_error = paymentResult.error

      if (paymentResult.details) {
        order.payment_gateway_response = JSON.stringify(paymentResult.details)
      }

      await order.save()

      throw new ErrorHandler(
        STATUS.BAD_REQUEST,
        `Thanh toán không thành công: ${paymentResult.error}`
      )
    }
  } catch (error) {
    // Nếu lỗi chưa được xử lý ở trên
    if (!error.status) {
      // Cập nhật thông tin lỗi cho đơn hàng
      order.status = OrderStatus.PAYMENT_FAILED
      order.payment_error = error.message
      await order.save()

      throw new ErrorHandler(
        STATUS.INTERNAL_SERVER_ERROR,
        `Lỗi xử lý thanh toán: ${error.message}`
      )
    }

    // Ném lại lỗi đã xử lý
    throw error
  }
}

/**
 * Get all orders with pagination and filtering options
 * GET /api/orders
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 10)
 * - status: OrderStatus (optional)
 * - from_date: Date (optional)
 * - to_date: Date (optional)
 */
export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const userId = req.jwtDecoded.id
    const { page = 1, limit = 10, status, from_date, to_date } = req.query

    // Build filter conditions
    const filter: any = { user: userId }

    // Add status filter if provided
    if (status && Object.values(OrderStatus).includes(status as OrderStatus)) {
      filter.status = status
    }

    // Add date range filter if provided
    if (from_date || to_date) {
      filter.createdAt = {}

      if (from_date) {
        const fromDate = new Date(from_date as string)
        if (!isNaN(fromDate.getTime())) {
          filter.createdAt.$gte = fromDate
        }
      }

      if (to_date) {
        const toDate = new Date(to_date as string)
        if (!isNaN(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999)
          filter.createdAt.$lte = toDate
        }
      }
    }

    // Parse pagination params
    const pageNumber = parseInt(page as string) || 1
    const limitNumber = parseInt(limit as string) || 10
    const skip = (pageNumber - 1) * limitNumber

    // Get total count for pagination
    const totalOrders = await OrderModel.countDocuments(filter)

    // Get orders with related data
    const orders = await OrderModel.find(filter)
      .populate({
        path: 'purchases',
        populate: {
          path: 'product',
          select: 'name image price price_before_discount shop',
          populate: {
            path: 'shop',
            select: 'name avatar',
          },
        },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean()

    return responseSuccess(res, {
      message: 'Lấy danh sách đơn hàng thành công',
      data: {
        orders: orders,
        pagination: {
          total: totalOrders,
          page: pageNumber,
          limit: limitNumber,
          pages: Math.ceil(totalOrders / limitNumber),
        },
      },
    })
  } catch (error) {
    console.error('Error getting orders:', error)
    if (error.status) {
      throw error
    }
    throw new ErrorHandler(
      STATUS.INTERNAL_SERVER_ERROR,
      'Lỗi khi lấy danh sách đơn hàng'
    )
  }
}

/**
 * Get detailed information about a specific order
 * GET /api/orders/:order_id
 */
export const getOrderDetail = async (req: Request, res: Response) => {
  try {
    const userId = req.jwtDecoded.id
    const { order_id } = req.params

    // Validate order_id
    if (!mongoose.Types.ObjectId.isValid(order_id)) {
      throw new ErrorHandler(STATUS.BAD_REQUEST, 'ID đơn hàng không hợp lệ')
    }

    // Find order and populate related data
    const order = await OrderModel.findOne({
      _id: order_id,
      user: userId,
    })
      .populate({
        path: 'purchases',
        populate: {
          path: 'product',
          populate: [
            {
              path: 'category',
              select: 'name _id',
            },
            {
              path: 'shop',
              select: 'name avatar address phone',
            },
          ],
        },
      })
      .lean()

    if (!order) {
      throw new ErrorHandler(STATUS.NOT_FOUND, 'Không tìm thấy đơn hàng')
    }

    // Calculate summary information
    const summary = {
      total_items: order.purchases?.length || 0,
      total_amount: order.total_amount,
      shipping_fee: order.shipping_fee,
      grand_total: order.total_amount + order.shipping_fee,
    }

    return responseSuccess(res, {
      message: 'Lấy chi tiết đơn hàng thành công',
      data: {
        order,
        summary,
      },
    })
  } catch (error) {
    console.error('Error getting order detail:', error)
    if (error.status) {
      throw error
    }
    throw new ErrorHandler(
      STATUS.INTERNAL_SERVER_ERROR,
      'Lỗi khi lấy chi tiết đơn hàng'
    )
  }
}

const orderController = {
  createOrder,
  processPayment,
  getAllOrders,
  getOrderDetail,
}

export default orderController
