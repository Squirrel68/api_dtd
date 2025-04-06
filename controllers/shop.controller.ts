import { Request, Response } from 'express'
import { responseSuccess, ErrorHandler } from '../utils/response'
import { UserModel } from '../database/models/user.model'
import { STATUS } from '../constants/status'
import { omitBy } from 'lodash'

const createShop = async (req: Request, res: Response) => {
  const { name, description, address, phone, avatar } = req.body

  // Get user ID from JWT token
  const userId = req.jwtDecoded.id

  // Find user
  const userDB = await UserModel.findById(userId)

  if (!userDB) {
    throw new ErrorHandler(STATUS.BAD_REQUEST, 'Không tìm thấy người dùng')
  }

  // Check if user already has a shop
  if (userDB.shop && userDB.shop.name) {
    throw new ErrorHandler(STATUS.BAD_REQUEST, 'Bạn đã có cửa hàng')
  }

  // Create shop object
  const shop = omitBy(
    {
      name,
      description,
      address,
      phone,
      avatar,
    },
    (value) => value === undefined || value === ''
  )

  // Update user with shop data
  const updatedUser = await UserModel.findByIdAndUpdate(
    userId,
    { shop },
    { new: true }
  )
    .select({ password: 0, __v: 0 })
    .lean()

  const response = {
    message: 'Tạo cửa hàng thành công',
    data: updatedUser.shop,
  }

  return responseSuccess(res, response)
}

const getShop = async (req: Request, res: Response) => {
  // Get user ID from JWT token or from request params
  const userId = req.params.user_id || req.jwtDecoded.id

  // Find user
  const userDB = await UserModel.findById(userId)
    .select({ password: 0, __v: 0 })
    .lean()

  if (!userDB) {
    throw new ErrorHandler(STATUS.BAD_REQUEST, 'Không tìm thấy người dùng')
  }

  // Check if user has a shop
  if (!userDB.shop || !userDB.shop.name) {
    throw new ErrorHandler(STATUS.BAD_REQUEST, 'Người dùng chưa có cửa hàng')
  }

  const response = {
    message: 'Lấy thông tin cửa hàng thành công',
    data: userDB.shop,
  }

  return responseSuccess(res, response)
}

const updateShop = async (req: Request, res: Response) => {
  const { name, description, address, phone, avatar } = req.body

  // Get user ID from JWT token
  const userId = req.jwtDecoded.id

  // Find user
  const userDB = await UserModel.findById(userId)

  if (!userDB) {
    throw new ErrorHandler(STATUS.BAD_REQUEST, 'Không tìm thấy người dùng')
  }

  // Create updated shop object
  const shopUpdate = omitBy(
    {
      name,
      description,
      address,
      phone,
      avatar,
    },
    (value) => value === undefined || value === ''
  )

  // Merge with existing shop data
  const shop = {
    ...userDB.shop,
    ...shopUpdate,
  }

  // Update user with shop data
  const updatedUser = await UserModel.findByIdAndUpdate(
    userId,
    { shop },
    { new: true }
  )
    .select({ password: 0, __v: 0 })
    .lean()

  const response = {
    message: 'Cập nhật cửa hàng thành công',
    data: updatedUser.shop,
  }

  return responseSuccess(res, response)
}

const shopController = {
  createShop,
  getShop,
  updateShop,
}

export default shopController
