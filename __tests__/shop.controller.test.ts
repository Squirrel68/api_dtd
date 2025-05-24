// __tests__/shop.controller.test.ts
import { Request, Response } from 'express'
import shopController from '../controllers/shop.controller'
import { UserModel } from '../database/models/user.model'
import { ProductModel } from '../database/models/product.model'
import { OrderModel } from '../database/models/order.model'
import { responseSuccess, ErrorHandler } from '../utils/response'
import { ROLE } from '../constants/role.enum'
import { STATUS } from '../constants/status'

// Mock dependencies
jest.mock('../database/models/user.model')
jest.mock('../database/models/product.model')
jest.mock('../database/models/order.model')
jest.mock('../utils/response', () => ({
  responseSuccess: jest.fn(),
  ErrorHandler: jest.fn().mockImplementation((status, message) => ({
    status,
    message,
    name: 'ErrorHandler',
  })),
}))

describe('Shop Controller', () => {
  let req: Partial<Request>
  let res: Partial<Response>

  beforeEach(() => {
    req = {
      jwtDecoded: { id: 'user123' },
      body: {},
      params: {},
    }
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }
    jest.clearAllMocks()
  })

  describe('createShop', () => {
    test('should create a shop successfully', async () => {
      // Arrange
      req.body = {
        name: 'Test Shop',
        description: 'Test Description',
        address: 'Test Address',
        phone: '1234567890',
        avatar: 'avatar.jpg',
      }

      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        shop: null,
      }

      const mockUpdatedUser = {
        _id: 'user123',
        email: 'test@example.com',
        shop: {
          name: 'Test Shop',
          description: 'Test Description',
          address: 'Test Address',
          phone: '1234567890',
          avatar: 'avatar.jpg',
        },
      }

      // Mock UserModel.findById
      ;(UserModel.findById as jest.Mock).mockResolvedValue(mockUser)

      // Mock UserModel.findByIdAndUpdate
      ;(UserModel.findByIdAndUpdate as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUpdatedUser),
      }))

      // Act
      await shopController.createShop(req as Request, res as Response)

      // Assert
      expect(UserModel.findById).toHaveBeenCalledWith('user123')
      expect(UserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user123',
        {
          shop: {
            name: 'Test Shop',
            description: 'Test Description',
            address: 'Test Address',
            phone: '1234567890',
            avatar: 'avatar.jpg',
          },
        },
        { new: true }
      )
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Tạo cửa hàng thành công',
        data: mockUpdatedUser.shop,
      })
    })

    test('should throw error when user not found', async () => {
      // Arrange
      req.body = {
        name: 'Test Shop',
      }

      // Mock UserModel.findById returns null (user not found)
      ;(UserModel.findById as jest.Mock).mockResolvedValue(null)

      // Act & Assert
      await expect(
        shopController.createShop(req as Request, res as Response)
      ).rejects.toEqual({
        status: STATUS.BAD_REQUEST,
        message: 'Không tìm thấy người dùng',
        name: 'ErrorHandler',
      })
    })

    test('should throw error when user already has a shop', async () => {
      // Arrange
      req.body = {
        name: 'Test Shop',
      }

      // Mock UserModel.findById returns user with existing shop
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        shop: { name: 'Existing Shop' },
      }
      ;(UserModel.findById as jest.Mock).mockResolvedValue(mockUser)

      // Act & Assert
      await expect(
        shopController.createShop(req as Request, res as Response)
      ).rejects.toEqual({
        status: STATUS.BAD_REQUEST,
        message: 'Bạn đã có cửa hàng',
        name: 'ErrorHandler',
      })
    })

    test('should create shop with only non-empty fields', async () => {
      // Arrange
      req.body = {
        name: 'Test Shop',
        description: '', // Empty string should be omitted
        address: 'Test Address',
        phone: undefined, // Undefined should be omitted
        avatar: null, // Null should be omitted
      }

      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        shop: null,
      }

      const mockUpdatedUser = {
        _id: 'user123',
        email: 'test@example.com',
        shop: {
          name: 'Test Shop',
          address: 'Test Address',
        },
      }

      // Mock UserModel.findById
      ;(UserModel.findById as jest.Mock).mockResolvedValue(mockUser)

      // Mock UserModel.findByIdAndUpdate
      ;(UserModel.findByIdAndUpdate as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUpdatedUser),
      }))

      // Act
      await shopController.createShop(req as Request, res as Response)

      // Assert
      expect(UserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user123',
        {
          shop: {
            name: 'Test Shop',
            address: 'Test Address',
          },
        },
        { new: true }
      )
    })
  })

  describe('getShop', () => {
    test('should get shop from JWT token ID', async () => {
      // Arrange
      req.jwtDecoded = { id: 'user123' }

      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        shop: { name: 'Test Shop', description: 'Test Description' },
      }

      const mockProducts = [{ _id: 'product1' }, { _id: 'product2' }]

      // Mock UserModel.findById
      ;(UserModel.findById as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUser),
      }))

      // Mock ProductModel.countDocuments
      ;(ProductModel.countDocuments as jest.Mock).mockResolvedValue(2)

      // Mock ProductModel.find
      ;(ProductModel.find as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockProducts),
      }))

      // Mock OrderModel.countDocuments
      ;(OrderModel.countDocuments as jest.Mock).mockResolvedValue(5)

      // Act
      await shopController.getShop(req as Request, res as Response)

      // Assert
      expect(UserModel.findById).toHaveBeenCalledWith('user123')
      expect(ProductModel.countDocuments).toHaveBeenCalledWith({
        shop: 'user123',
      })
      expect(ProductModel.find).toHaveBeenCalledWith({ shop: 'user123' })
      expect(OrderModel.countDocuments).toHaveBeenCalledWith({
        purchases: {
          $elemMatch: {
            product: { $in: ['product1', 'product2'] },
          },
        },
      })
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Lấy thông tin cửa hàng thành công',
        data: {
          name: 'Test Shop',
          description: 'Test Description',
          totalProduct: 2,
          totalOrder: 5,
        },
      })
    })

    test('should get shop from params ID', async () => {
      // Arrange
      req.params = { user_id: 'user456' }

      const mockUser = {
        _id: 'user456',
        email: 'other@example.com',
        shop: { name: 'Other Shop', description: 'Other Description' },
      }

      const mockProducts = [{ _id: 'product3' }]

      // Mock UserModel.findById
      ;(UserModel.findById as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUser),
      }))

      // Mock ProductModel.countDocuments
      ;(ProductModel.countDocuments as jest.Mock).mockResolvedValue(1)

      // Mock ProductModel.find
      ;(ProductModel.find as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockProducts),
      }))

      // Mock OrderModel.countDocuments
      ;(OrderModel.countDocuments as jest.Mock).mockResolvedValue(2)

      // Act
      await shopController.getShop(req as Request, res as Response)

      // Assert
      expect(UserModel.findById).toHaveBeenCalledWith('user456')
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Lấy thông tin cửa hàng thành công',
        data: {
          name: 'Other Shop',
          description: 'Other Description',
          totalProduct: 1,
          totalOrder: 2,
        },
      })
    })

    test('should throw error when user not found', async () => {
      // Arrange
      // Mock UserModel.findById returns null
      ;(UserModel.findById as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      }))

      // Act & Assert
      await expect(
        shopController.getShop(req as Request, res as Response)
      ).rejects.toEqual({
        status: STATUS.BAD_REQUEST,
        message: 'Không tìm thấy người dùng',
        name: 'ErrorHandler',
      })
    })

    test('should throw error when user has no shop', async () => {
      // Arrange
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        shop: null, // No shop
      }

      // Mock UserModel.findById
      ;(UserModel.findById as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUser),
      }))

      // Act & Assert
      await expect(
        shopController.getShop(req as Request, res as Response)
      ).rejects.toEqual({
        status: STATUS.BAD_REQUEST,
        message: 'Người dùng chưa có cửa hàng',
        name: 'ErrorHandler',
      })
    })
  })

  describe('updateShop', () => {
    test('should update shop successfully', async () => {
      // Arrange
      req.body = {
        name: 'Updated Shop',
        description: 'Updated Description',
      }
      req.jwtDecoded = { id: 'user123' }

      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        shop: {
          name: 'Old Shop',
          description: 'Old Description',
          address: 'Old Address',
          phone: '0987654321',
        },
      }

      const mockUpdatedUser = {
        _id: 'user123',
        email: 'test@example.com',
        shop: {
          name: 'Updated Shop',
          description: 'Updated Description',
          address: 'Old Address',
          phone: '0987654321',
        },
        roles: [ROLE.ADMIN],
      }

      // Mock UserModel.findById
      ;(UserModel.findById as jest.Mock).mockResolvedValue(mockUser)

      // Mock UserModel.findByIdAndUpdate
      ;(UserModel.findByIdAndUpdate as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUpdatedUser),
      }))

      // Act
      await shopController.updateShop(req as Request, res as Response)

      // Assert
      expect(UserModel.findById).toHaveBeenCalledWith('user123')
      expect(UserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user123',
        {
          shop: {
            name: 'Updated Shop',
            description: 'Updated Description',
            address: 'Old Address',
            phone: '0987654321',
          },
          roles: [ROLE.ADMIN],
        },
        { new: true }
      )
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Cập nhật cửa hàng thành công',
        data: mockUpdatedUser.shop,
      })
    })

    test('should throw error when user not found', async () => {
      // Arrange
      req.body = {
        name: 'Updated Shop',
      }

      // Mock UserModel.findById returns null (user not found)
      ;(UserModel.findById as jest.Mock).mockResolvedValue(null)

      // Act & Assert
      await expect(
        shopController.updateShop(req as Request, res as Response)
      ).rejects.toEqual({
        status: STATUS.BAD_REQUEST,
        message: 'Không tìm thấy người dùng',
        name: 'ErrorHandler',
      })
    })

    test('should update shop with only provided fields', async () => {
      // Arrange
      req.body = {
        name: 'Updated Shop',
        address: '', // Empty string should be omitted
        phone: '0123456789',
      }
      req.jwtDecoded = { id: 'user123' }

      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        shop: {
          name: 'Old Shop',
          description: 'Old Description',
          address: 'Old Address',
          phone: '0987654321',
        },
      }

      const mockUpdatedUser = {
        _id: 'user123',
        email: 'test@example.com',
        shop: {
          name: 'Updated Shop',
          description: 'Old Description',
          address: 'Old Address', // Unchanged
          phone: '0123456789',
        },
        roles: [ROLE.ADMIN],
      }

      // Mock UserModel.findById
      ;(UserModel.findById as jest.Mock).mockResolvedValue(mockUser)

      // Mock UserModel.findByIdAndUpdate
      ;(UserModel.findByIdAndUpdate as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUpdatedUser),
      }))

      // Act
      await shopController.updateShop(req as Request, res as Response)

      // Assert
      expect(UserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user123',
        {
          shop: {
            name: 'Updated Shop',
            description: 'Old Description',
            address: 'Old Address',
            phone: '0123456789',
          },
          roles: [ROLE.ADMIN],
        },
        { new: true }
      )
    })

    test('should set ADMIN role when updating shop', async () => {
      // Arrange
      req.body = {
        name: 'Updated Shop',
      }
      req.jwtDecoded = { id: 'user123' }

      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        shop: {
          name: 'Old Shop',
        },
        roles: [], // No roles initially
      }

      const mockUpdatedUser = {
        _id: 'user123',
        email: 'test@example.com',
        shop: {
          name: 'Updated Shop',
        },
        roles: [ROLE.ADMIN], // ADMIN role added
      }

      // Mock UserModel.findById
      ;(UserModel.findById as jest.Mock).mockResolvedValue(mockUser)

      // Mock UserModel.findByIdAndUpdate
      ;(UserModel.findByIdAndUpdate as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUpdatedUser),
      }))

      // Act
      await shopController.updateShop(req as Request, res as Response)

      // Assert
      expect(UserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user123',
        {
          shop: {
            name: 'Updated Shop',
          },
          roles: [ROLE.ADMIN],
        },
        { new: true }
      )
    })
  })
})
