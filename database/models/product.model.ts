import mongoose, { Schema, Document } from 'mongoose'

export interface IProduct extends Document {
  name: string
  image: string
  images: string[]
  description?: string
  category: mongoose.Types.ObjectId
  price: number
  rating: number
  price_before_discount: number
  quantity: number
  sold: number
  view: number
  shop: mongoose.Types.ObjectId
}

const ProductSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 160 },
    image: { type: String, required: true, maxlength: 1000 },
    images: [{ type: String, maxlength: 1000 }],
    description: { type: String },
    category: { type: mongoose.SchemaTypes.ObjectId, ref: 'categories' },
    price: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    price_before_discount: { type: Number, default: 0 },
    quantity: { type: Number, default: 0 },
    sold: { type: Number, default: 0 },
    monthlySold: { type: Number, default: 0 },
    view: { type: Number, default: 0 },
    shop: { type: Schema.Types.ObjectId, ref: 'users' },
  },
  {
    timestamps: true,
  }
)
export const ProductModel = mongoose.model<IProduct>('products', ProductSchema)
