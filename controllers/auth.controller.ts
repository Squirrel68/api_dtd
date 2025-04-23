import { ErrorHandler, responseSuccess } from '../utils/response'
import { hashValue, compareValue } from '../utils/crypt'
import { config } from '../constants/config'
import { signToken, verifyToken } from '../utils/jwt'
import { Request, Response } from 'express'
import { ROLE } from '../constants/role.enum'
import { UserModel } from '../database/models/user.model'
import { omit } from 'lodash'
import { STATUS } from '../constants/status'
import { RefreshTokenModel } from '../database/models/refresh-token.model'

const generateRefreshToken = async (userId): Promise<string> => {
  // Tạo refresh token
  const refreshToken = (await signToken(
    { id: userId, time: Date.now() }, // thêm timestamp để đảm bảo token unique
    config.REFRESH_TOKEN_SECRET || 'shopee-refresh',
    config.EXPIRE_REFRESH_TOKEN || 60 * 60 * 24 * 30 // 30 ngày
  )) as string

  // Lưu token vào DB
  await RefreshTokenModel.create({
    user_id: userId,
    token: refreshToken,
  })

  return refreshToken
}

// Tạo access token (không lưu trong DB)
const generateAccessToken = (user) => {
  const payloadJWT = {
    id: user._id,
    email: user.email,
    roles: user.roles,
    created_at: new Date().toISOString(),
  }

  return signToken(
    payloadJWT,
    config.SECRET_KEY || 'shopee-clone',
    config.EXPIRE_ACCESS_TOKEN || 60 * 60 // 1 giờ
  )
}

const registerController = async (req: Request, res: Response) => {
  const body: Register = req.body
  const { email, password, name } = body
  const userInDB = await UserModel.findOne({ email: email }).exec()
  if (!userInDB) {
    const hashedPassword = hashValue(password)
    const user = {
      email,
      password: hashedPassword,
      name,
    }
    const userAdd = await (await new UserModel(user).save()).toObject()
    // Tạo access token (không lưu trong DB)
    const access_token = await generateAccessToken(userAdd)

    // Tạo refresh token và lưu vào DB
    const refresh_token = await generateRefreshToken(userAdd._id)
    const response = {
      message: 'Đăng ký thành công',
      data: {
        access_token,
        refresh_token,
        expires: config.EXPIRE_ACCESS_TOKEN,
        user: omit(userAdd, ['password']),
      },
    }
    return responseSuccess(res, response)
  }
  throw new ErrorHandler(STATUS.BAD_REQUEST, {
    email: 'Email đã tồn tại',
  })
}

const loginController = async (req: Request, res: Response) => {
  const body: Login = req.body
  const { email, password } = body
  const userInDB: any = await UserModel.findOne({ email: email }).lean()
  if (!userInDB) {
    throw new ErrorHandler(STATUS.UNPROCESSABLE_ENTITY, {
      password: 'Email hoặc password không đúng',
    })
  } else {
    const match = compareValue(password, userInDB.password)
    if (!match) {
      throw new ErrorHandler(STATUS.UNPROCESSABLE_ENTITY, {
        password: 'Email hoặc password không đúng',
      })
    }
    // Tạo access token (không lưu trong DB)
    const access_token = await generateAccessToken(userInDB)

    // Tạo refresh token và lưu vào DB
    const refresh_token = await generateRefreshToken(userInDB._id)
    const response = {
      message: 'Đăng nhập thành công',
      data: {
        access_token,
        refresh_token,
        expires: config.EXPIRE_ACCESS_TOKEN,
        user: omit(userInDB, ['password']),
      },
    }
    return responseSuccess(res, response)
  }
}
const refreshTokenController = async (req: Request, res: Response) => {
  const { refresh_token } = req.body

  if (!refresh_token) {
    throw new ErrorHandler(
      STATUS.BAD_REQUEST,
      'Refresh token không được cung cấp'
    )
  }

  try {
    const payload: any = await verifyToken(
      refresh_token,
      config.REFRESH_TOKEN_SECRET || 'shopee-refresh'
    )

    // Tìm refresh token trong DB
    const refreshTokenDoc = await RefreshTokenModel.findOne({
      token: refresh_token,
    })

    if (!refreshTokenDoc) {
      throw new ErrorHandler(STATUS.UNAUTHORIZED, 'Refresh token không hợp lệ')
    }

    // Lấy thông tin người dùng
    const user = await UserModel.findById(payload.id).lean()
    if (!user) {
      throw new ErrorHandler(STATUS.UNAUTHORIZED, 'Người dùng không tồn tại')
    }

    // Tạo access token mới
    const newAccessToken = await generateAccessToken(user)

    // Tạo refresh token mới
    const newRefreshToken = await generateRefreshToken(user._id)

    // Xóa refresh token cũ
    await RefreshTokenModel.deleteOne({ token: refresh_token })

    return responseSuccess(res, {
      message: 'Làm mới token thành công',
      data: {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_in: config.EXPIRE_ACCESS_TOKEN,
        user: omit(user, ['password']),
      },
    })
  } catch (error) {
    if (
      error.name === 'JsonWebTokenError' ||
      error.name === 'TokenExpiredError'
    ) {
      throw new ErrorHandler(
        STATUS.UNAUTHORIZED,
        'Refresh token không hợp lệ hoặc đã hết hạn'
      )
    }
    throw error
  }
}
const logoutController = async (req: Request, res: Response) => {
  const { refresh_token } = req.body
  if (refresh_token) {
    await RefreshTokenModel.deleteOne({ token: refresh_token })
  }

  return responseSuccess(res, { message: 'Đăng xuất thành công' })
}

const authController = {
  registerController,
  loginController,
  logoutController,
  refreshTokenController,
}

export default authController
