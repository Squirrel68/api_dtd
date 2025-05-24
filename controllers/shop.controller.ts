import { Request, Response } from 'express'
import { responseSuccess, ErrorHandler } from '../utils/response'
import { UserModel } from '../database/models/user.model'
import { STATUS } from '../constants/status'
import { omitBy } from 'lodash'
import { ROLE } from '../constants/role.enum'
import { ProductModel } from '../database/models/product.model'
import { OrderModel } from '../database/models/order.model'

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

  const totalProduct = await ProductModel.countDocuments({ shop: userId })
  const shopProducts = await ProductModel.find({ shop: userId })
    .select('_id')
    .lean()
  const shopProductIds = shopProducts.map((product) => product._id)

  const totalOrder = await OrderModel.countDocuments({
    purchases: {
      $elemMatch: {
        product: { $in: shopProductIds },
      },
    },
  })

  const shopData = {
    ...userDB.shop,
    totalProduct,
    totalOrder,
  }

  const response = {
    message: 'Lấy thông tin cửa hàng thành công',
    data: shopData,
  }

  return responseSuccess(res, response)
}

const updateShop = async (req: Request, res: Response) => {
  const { name, description, address, phone, avatar } = req.body
  const userId = req.jwtDecoded.id
  const userDB = await UserModel.findById(userId)

  if (!userDB) {
    throw new ErrorHandler(STATUS.BAD_REQUEST, 'Không tìm thấy người dùng')
  }
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
  const shop = {
    ...userDB.shop,
    ...shopUpdate,
  }
  const updatedUser = await UserModel.findByIdAndUpdate(
    userId,
    { shop, roles: [ROLE.ADMIN] },
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
