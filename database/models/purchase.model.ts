import mongoose, { Schema, Document } from 'mongoose'
import { STATUS_PURCHASE } from '../../constants/purchase'

export interface IPurchase extends Document {
  user: mongoose.Types.ObjectId
  product: mongoose.Types.ObjectId
  buy_count: number
  price: number
  price_before_discount: number
  status: number
}

const PurchaseSchema = new Schema(
  {
    user: { type: mongoose.SchemaTypes.ObjectId, ref: 'users' },
    product: { type: mongoose.SchemaTypes.ObjectId, ref: 'products' },
    buy_count: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
    price_before_discount: { type: Number, default: 0 },
    status: { type: Number, default: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION },
  },
  {
    timestamps: true,
  }
)
export const PurchaseModel = mongoose.model<IPurchase>(
  'purchases',
  PurchaseSchema
)
