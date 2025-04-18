import { Request, Response } from 'express'
import { ErrorHandler, responseSuccess } from '../utils/response'
import { STATUS } from '../constants/status'
import { PurchaseModel } from '../database/models/purchase.model'
import { STATUS_PURCHASE } from '../constants/purchase'
import { OrderModel, OrderStatus } from '../database/models/order.model'
// Tạo đơn hàng mới
const createOrder = async (req: Request, res: Response) => {
  const userId = req.jwtDecoded.id
  const { purchase_ids, full_name, phone, address, payment_method, note } =
    req.body

  // Validate dữ liệu
  if (
    !purchase_ids ||
    !purchase_ids.length ||
    !full_name ||
    !phone ||
    !address ||
    !payment_method
  ) {
    throw new ErrorHandler(STATUS.BAD_REQUEST, 'Thiếu thông tin đặt hàng')
  }

  // Lấy các sản phẩm từ giỏ hàng
  const purchases = await PurchaseModel.find({
    _id: { $in: purchase_ids },
    user: userId,
  }).populate('product')

  if (purchases.length === 0) {
    throw new ErrorHandler(
      STATUS.NOT_FOUND,
      'Không tìm thấy sản phẩm trong giỏ hàng'
    )
  }

  // Tính tổng tiền
  const total_amount = purchases.reduce(
    (total, purchase: any) => total + purchase.price * purchase.buy_count,
    0
  )

  // Phí vận chuyển
  const shipping_fee = 30000 // VNĐ

  // Tạo đơn hàng mới
  const order = await new OrderModel({
    user: userId,
    purchases: purchase_ids,
    full_name,
    phone,
    address,
    total_amount,
    shipping_fee,
    payment_method,
    status: OrderStatus.PENDING,
    note: note || '',
  }).save()

  // Cập nhật trạng thái purchases
  await PurchaseModel.updateMany(
    { _id: { $in: purchase_ids } },
    { status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION }
  )

  // Lấy thông tin đơn hàng đầy đủ
  const populatedOrder = await OrderModel.findById(order._id).populate({
    path: 'purchases',
    populate: {
      path: 'product',
      select: 'name image price price_before_discount',
    },
  })

  return responseSuccess(res, {
    message: 'Đặt hàng thành công',
    data: populatedOrder,
  })
}
