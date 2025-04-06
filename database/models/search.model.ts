import mongoose, { Schema } from 'mongoose'

const SearchHistory = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'users' },
    search: { type: String, required: true },
  },
  {
    timestamps: true,
  }
)

export const SearchHistoryModel = mongoose.model(
  'search_histories',
  SearchHistory
)
