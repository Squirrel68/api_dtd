import mongoose, { Schema, Document } from 'mongoose'

export interface IRefreshToken extends Document {
  user_id: mongoose.Types.ObjectId
  token: string
  created_at?: Date
  updated_at?: Date
}

const RefreshTokenSchema = new Schema(
  {
    user_id: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'users',
      required: true,
    },
    token: {
      type: String,
      unique: true,
      required: true,
    },
  },
  {
    timestamps: true,
  }
)

export const RefreshTokenModel = mongoose.model<IRefreshToken>(
  'refresh_tokens',
  RefreshTokenSchema
)
