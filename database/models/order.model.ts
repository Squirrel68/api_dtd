import mongoose, { Schema, Document } from 'mongoose'

export enum OrderStatus {
  PENDING = 'Pending', // Đơn hàng mới tạo
  PAID = 'Paid', // Đã thanh toán
  PROCESSING = 'Processing', // Đang xử lý
  SHIPPING = 'Shipping', // Đang vận chuyển
  DELIVERED = 'Delivered', // Đã giao hàng
  COMPLETED = 'Completed', // Hoàn thành
  CANCELED = 'Canceled', // Đã hủy
  PAYMENT_FAILED = 'PaymentFailed', // Thanh toán thất bại
}

export interface IOrder extends Document {
  user: mongoose.Types.ObjectId
  purchases: mongoose.Types.ObjectId[]
  full_name: string // Tên người nhận
  phone: string // SĐT người nhận
  address: string // Giữ nguyên địa chỉ là string theo yêu cầu
  total_amount: number // Tổng số tiền đơn hàng
  shipping_fee: number // Phí vận chuyển
  payment_method: string // 'cod', 'bank_transfer', etc.
  status: OrderStatus
  note?: string // Ghi chú của người đặt hàng
  tracking_number?: string
  canceled_reason?: string
  paid_at?: Date // Thời điểm thanh toán
  delivered_at?: Date // Thời điểm giao hàng
  completed_at?: Date // Thời điểm hoàn thành

  // Thêm các trường liên quan đến Recurly
  recurly_transaction_id?: string // ID giao dịch từ Recurly
  recurly_account_id?: string // ID tài khoản Recurly
  payment_gateway_response?: string // Lưu trữ response từ payment gateway
  payment_error?: string // Lưu trữ lỗi thanh toán nếu có
}

const OrderSchema = new Schema(
  {
    user: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'users',
      required: true,
    },
    purchases: [
      {
        type: mongoose.SchemaTypes.ObjectId,
        ref: 'purchases',
        required: true,
      },
    ],
    full_name: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    total_amount: {
      type: Number,
      required: true,
    },
    shipping_fee: {
      type: Number,
      default: 0,
    },
    payment_method: {
      type: String,
      enum: [
        'cod',
        'bank_transfer',
        'credit_card',
        'momo',
        'zalopay',
        'recurly',
      ],
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.PENDING,
    },
    note: {
      type: String,
    },
    tracking_number: {
      type: String,
    },
    canceled_reason: {
      type: String,
    },
    paid_at: {
      type: Date,
    },
    delivered_at: {
      type: Date,
    },
    completed_at: {
      type: Date,
    },

    // Thêm các trường mới
    recurly_transaction_id: {
      type: String,
    },
    recurly_account_id: {
      type: String,
    },
    payment_gateway_response: {
      type: String,
    },
    payment_error: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
)

export const OrderModel = mongoose.model<IOrder>('orders', OrderSchema)
