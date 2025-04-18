import { config } from '../constants/config'
import { verifyToken } from '../utils/jwt'
import { NextFunction, Request, Response } from 'express'
import { ROLE } from '../constants/role.enum'
import { responseError, ErrorHandler } from '../utils/response'
import { STATUS } from '../constants/status'
import { body } from 'express-validator'
import { UserModel } from '../database/models/user.model'

const verifyAccessToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authorization = req.headers.authorization

  if (authorization && authorization.startsWith('Bearer ')) {
    const access_token = authorization.split(' ')[1]
    try {
      const decoded = (await verifyToken(
        access_token,
        config.SECRET_KEY
      )) as PayloadToken
      req.jwtDecoded = decoded
      return next()
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return responseError(
          res,
          new ErrorHandler(STATUS.UNAUTHORIZED, 'Token đã hết hạn')
        )
      }
      return responseError(
        res,
        new ErrorHandler(STATUS.UNAUTHORIZED, 'Token không hợp lệ')
      )
    }
  }
  return responseError(
    res,
    new ErrorHandler(STATUS.UNAUTHORIZED, 'Token không được gửi')
  )
}

const refreshTokenRules = () => {
  return [
    body('refresh_token')
      .exists()
      .withMessage('Refresh token không được để trống')
      .isString()
      .withMessage('Refresh token phải là chuỗi'),
  ]
}

const verifyAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const userDB: User = await UserModel.findById(req.jwtDecoded.id).lean()
  if (userDB.roles.includes(ROLE.ADMIN)) {
    return next()
  }
  return responseError(
    res,
    new ErrorHandler(STATUS.FORBIDDEN, 'Không có quyền truy cập')
  )
}

const registerRules = () => {
  return [
    body('email')
      .isEmail()
      .withMessage('Email không đúng định dạng')
      .isLength({ min: 5, max: 160 })
      .withMessage('Email phải từ 5-160 kí tự'),
    body('password')
      .exists({ checkFalsy: true })
      .withMessage('Mật khẩu không được để trống')
      .isLength({ min: 6, max: 160 })
      .withMessage('Mật khẩu phải từ 6-160 kí tự'),
  ]
}

const loginRules = () => {
  return [
    body('email')
      .isEmail()
      .withMessage('Email không đúng định dạng')
      .isLength({ min: 5, max: 160 })
      .withMessage('Email phải từ 5-160 kí tự'),
    body('password')
      .isLength({ min: 6, max: 160 })
      .withMessage('Mật khẩu phải từ 6-160 kí tự'),
  ]
}

const authMiddleware = {
  verifyAccessToken,
  verifyAdmin,
  registerRules,
  loginRules,
  refreshTokenRules,
}

export default authMiddleware
