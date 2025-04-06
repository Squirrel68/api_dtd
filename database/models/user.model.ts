import mongoose, { Schema, Document } from 'mongoose'
import { ROLE } from '../../constants/role.enum'

// Define the Shop interface
export interface IShop {
  name?: string
  description?: string
  address?: string
  phone?: string
  avatar?: string
}

// Define the User interface that extends the Document interface
export interface IUser extends Document {
  email: string
  name?: string
  password: string
  date_of_birth?: Date
  address?: string
  phone?: string
  roles: string[]
  avatar?: string
  shop?: IShop
  createdAt: Date
  updatedAt: Date
  watchList?: mongoose.Schema.Types.ObjectId[]
}

const UserSchema = new Schema(
  {
    email: { type: String, required: true, minlength: 5, maxlength: 160 },
    name: { type: String, maxlength: 160 },
    password: { type: String, required: true, minlength: 6, maxlength: 160 },
    date_of_birth: { type: Date, maxlength: 160 },
    address: { type: String, maxlength: 160 },
    phone: { type: String, maxlength: 20 },
    roles: { type: [String], required: true, default: [ROLE.ADMIN] },
    avatar: { type: String, maxlength: 1000 },
    watchList: [{ type: mongoose.SchemaTypes.ObjectId, ref: 'products' }],
    shop: {
      name: { type: String, maxlength: 160 },
      description: { type: String, maxlength: 1000 },
      address: { type: String, maxlength: 160 },
      phone: { type: String, maxlength: 20 },
      avatar: { type: String, maxlength: 1000 },
    },
  },
  {
    timestamps: true,
  }
)

// Define a type that represents the raw user data (without Document methods)
export type User = Omit<IUser, keyof Document>

export const UserModel = mongoose.model<IUser>('users', UserSchema)
