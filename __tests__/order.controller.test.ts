// __tests__/order.controller.test.ts
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { Request, Response } from 'express'
import orderController from '../controllers/order.controller'
import { OrderModel, OrderStatus } from '../database/models/order.model'
import { ProductModel } from '../database/models/product.model'
import { PurchaseModel } from '../database/models/purchase.model'
import { UserModel } from '../database/models/user.model'
import { STATUS_PURCHASE } from '../constants/purchase'
import { responseSuccess, ErrorHandler } from '../utils/response'
import { recurlyService } from '../utils/RecurlyService'

// Mock dependencies
jest.mock('../database/models/order.model')
jest.mock('../database/models/product.model')
jest.mock('../database/models/purchase.model')
jest.mock('../database/models/user.model')
jest.mock('../utils/RecurlyService', () => ({
  recurlyService: {
    processPayment: jest.fn(),
  },
}))
jest.mock('../utils/response', () => ({
  responseSuccess: jest.fn(),
  ErrorHandler: jest.fn().mockImplementation((status, message) => ({
    status,
    message,
    name: 'ErrorHandler',
  })),
}))

let mongoServer: MongoMemoryServer

describe('Order Controller', () => {
  let req: Partial<Request>
  let res: Partial<Response>

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create()
    const uri = mongoServer.getUri()
    await mongoose.connect(uri)
  })

  afterAll(async () => {
    await mongoose.disconnect()
    await mongoServer.stop()
  })

  beforeEach(() => {
    req = {
      jwtDecoded: { id: 'user123' },
      body: {},
      params: {},
      query: {},
    }

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }

    // Reset mocks
    jest.clearAllMocks()
  })

  describe('createOrder', () => {
    test('should create order successfully with valid inputs', async () => {
      // Arrange
      req.body = {
        purchase_ids: ['purchase1', 'purchase2'],
        full_name: 'Test User',
        phone: '1234567890',
        address: '123 Test St',
        note: 'Test note',
      }

      // Mock user model findById
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
      }
      ;(UserModel.findById as jest.Mock).mockResolvedValue(mockUser)

      // Mock purchase model find
      const mockPurchases = [
        {
          _id: 'purchase1',
          product: {
            _id: 'product1',
            name: 'Product 1',
            quantity: 10,
          },
          buy_count: 2,
          price: 100,
        },
        {
          _id: 'purchase2',
          product: {
            _id: 'product2',
            name: 'Product 2',
            quantity: 20,
          },
          buy_count: 1,
          price: 200,
        },
      ]
      ;(PurchaseModel.find as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(mockPurchases),
      }))

      // Mock order model create
      const mockOrder = {
        _id: 'order123',
        user: 'user123',
        purchases: ['purchase1', 'purchase2'],
        full_name: 'Test User',
        phone: '1234567890',
        address: '123 Test St',
        total_amount: 400, // 2*100 + 1*200
        shipping_fee: 30000,
        payment_method: 'recurly',
        status: OrderStatus.PENDING,
        note: 'Test note',
      }
      ;(OrderModel.create as jest.Mock).mockResolvedValue(mockOrder)

      // Act
      await orderController.createOrder(req as Request, res as Response)

      // Assert
      expect(UserModel.findById).toHaveBeenCalledWith('user123')
      expect(PurchaseModel.find).toHaveBeenCalledWith({
        _id: { $in: ['purchase1', 'purchase2'] },
        user: 'user123',
        status: STATUS_PURCHASE.IN_CART,
      })
      expect(OrderModel.create).toHaveBeenCalledWith({
        user: 'user123',
        purchases: ['purchase1', 'purchase2'],
        full_name: 'Test User',
        phone: '1234567890',
        address: '123 Test St',
        total_amount: 400,
        shipping_fee: 30000,
        payment_method: 'recurly',
        status: OrderStatus.PENDING,
        note: 'Test note',
      })
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Tạo đơn hàng thành công, chờ thanh toán',
        data: {
          orderId: 'order123',
          total_amount: 30400, // 400 + 30000
        },
      })
    })

    test('should throw error when missing required input data', async () => {
      // Arrange
      req.body = {
        purchase_ids: ['purchase1'],
        // missing full_name
        phone: '1234567890',
        address: '123 Test St',
      }

      // Act & Assert
      await expect(
        orderController.createOrder(req as Request, res as Response)
      ).rejects.toEqual(
        expect.objectContaining({
          status: 400,
          message: 'Thiếu thông tin đơn hàng',
        })
      )
    })

    test('should throw error when user not found', async () => {
      // Arrange
      req.body = {
        purchase_ids: ['purchase1'],
        full_name: 'Test User',
        phone: '1234567890',
        address: '123 Test St',
      }

      // Mock user not found
      ;(UserModel.findById as jest.Mock).mockResolvedValue(null)

      // Act & Assert
      await expect(
        orderController.createOrder(req as Request, res as Response)
      ).rejects.toEqual(
        expect.objectContaining({
          status: 404,
          message: 'Không tìm thấy thông tin người dùng',
        })
      )
    })

    test('should throw error when no purchases found in cart', async () => {
      // Arrange
      req.body = {
        purchase_ids: ['purchase1'],
        full_name: 'Test User',
        phone: '1234567890',
        address: '123 Test St',
      }

      // Mock user found
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
      }
      ;(UserModel.findById as jest.Mock).mockResolvedValue(mockUser)

      // Mock no purchases found
      ;(PurchaseModel.find as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue([]),
      }))

      // Act & Assert
      await expect(
        orderController.createOrder(req as Request, res as Response)
      ).rejects.toEqual(
        expect.objectContaining({
          status: 404,
          message: 'Không tìm thấy sản phẩm trong giỏ hàng',
        })
      )
    })

    test('should throw error when product quantity is insufficient', async () => {
      // Arrange
      req.body = {
        purchase_ids: ['purchase1'],
        full_name: 'Test User',
        phone: '1234567890',
        address: '123 Test St',
      }

      // Mock user found
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
      }
      ;(UserModel.findById as jest.Mock).mockResolvedValue(mockUser)

      // Mock purchases with insufficient quantity
      const mockPurchases = [
        {
          _id: 'purchase1',
          product: {
            _id: 'product1',
            name: 'Product 1',
            quantity: 5,
          },
          buy_count: 10, // greater than quantity
          price: 100,
        },
      ]
      ;(PurchaseModel.find as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(mockPurchases),
      }))

      // Act & Assert
      await expect(
        orderController.createOrder(req as Request, res as Response)
      ).rejects.toEqual(
        expect.objectContaining({
          status: 400,
          message: 'Sản phẩm "Product 1" chỉ còn 5 trong kho',
        })
      )
    })
  })

  describe('processPayment', () => {
    test('should process payment successfully', async () => {
      // Arrange
      req.params = { orderId: 'order123' }
      req.body = { token_id: 'token123' }

      // Mock mongoose isValid
      mongoose.Types.ObjectId.isValid = jest.fn().mockReturnValue(true)

      // Mock order model findOne
      const mockOrder = {
        _id: 'order123',
        user: 'user123',
        purchases: ['purchase1', 'purchase2'],
        total_amount: 400,
        shipping_fee: 30000,
        status: OrderStatus.PENDING,
        payment_method: 'recurly',
        save: jest.fn().mockResolvedValue(true),
      }
      ;(OrderModel.findOne as jest.Mock).mockResolvedValue(mockOrder)

      // Mock user model findById
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        name: 'Test User',
        recurly_account_id: null,
        save: jest.fn().mockResolvedValue(true),
      }
      ;(UserModel.findById as jest.Mock).mockResolvedValue(mockUser)

      // Mock recurlyService.processPayment
      const mockPaymentResult = {
        success: true,
        transaction_id: 'transaction123',
        account_id: 'account123',
        response: { id: 'response123' },
      }
      ;(recurlyService.processPayment as jest.Mock).mockResolvedValue(
        mockPaymentResult
      )

      // Mock Purchase model updateMany
      ;(PurchaseModel.updateMany as jest.Mock).mockResolvedValue({
        modifiedCount: 2,
      })

      // Mock Purchase model find for populating products
      const mockPurchases = [
        {
          _id: 'purchase1',
          product: { _id: 'product1', name: 'Product 1' },
          buy_count: 2,
        },
        {
          _id: 'purchase2',
          product: { _id: 'product2', name: 'Product 2' },
          buy_count: 1,
        },
      ]
      ;(PurchaseModel.find as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(mockPurchases),
      }))

      // Mock Product model findByIdAndUpdate
      ;(ProductModel.findByIdAndUpdate as jest.Mock).mockResolvedValue(true)

      // Act
      await orderController.processPayment(req as Request, res as Response)

      // Assert
      expect(mongoose.Types.ObjectId.isValid).toHaveBeenCalledWith('order123')
      expect(OrderModel.findOne).toHaveBeenCalledWith({
        _id: 'order123',
        user: 'user123',
        status: OrderStatus.PENDING,
        payment_method: 'recurly',
      })
      expect(UserModel.findById).toHaveBeenCalledWith('user123')
      expect(recurlyService.processPayment).toHaveBeenCalledWith(
        mockOrder,
        mockUser,
        'token123'
      )

      // Check order updates
      expect(mockOrder.status).toBe(OrderStatus.PAID)
      expect(mockOrder.save).toHaveBeenCalled()

      // Check user updates
      expect(mockUser.recurly_account_id).toBe('account123')
      expect(mockUser.save).toHaveBeenCalled()

      // Check purchase updates
      expect(PurchaseModel.updateMany).toHaveBeenCalledWith(
        { _id: { $in: ['purchase1', 'purchase2'] } },
        { status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION }
      )

      // Check product inventory updates
      expect(ProductModel.findByIdAndUpdate).toHaveBeenCalledTimes(2)
      expect(ProductModel.findByIdAndUpdate).toHaveBeenCalledWith('product1', {
        $inc: {
          quantity: -2,
          sold: 2,
          monthlySold: 2,
        },
      })
      expect(ProductModel.findByIdAndUpdate).toHaveBeenCalledWith('product2', {
        $inc: {
          quantity: -1,
          sold: 1,
          monthlySold: 1,
        },
      })

      // Check response
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Thanh toán thành công',
        data: {
          orderId: 'order123',
          status: OrderStatus.PAID,
          transaction_id: 'transaction123',
          paid_at: expect.any(Date),
        },
      })
    })

    test('should throw error when order ID is invalid', async () => {
      // Arrange
      req.params = { orderId: 'invalid-id' }
      req.body = { token_id: 'token123' }

      // Mock mongoose isValid
      mongoose.Types.ObjectId.isValid = jest.fn().mockReturnValue(false)

      // Act & Assert
      await expect(
        orderController.processPayment(req as Request, res as Response)
      ).rejects.toEqual(
        expect.objectContaining({
          status: 400,
          message: 'ID đơn hàng không hợp lệ',
        })
      )
    })

    test('should throw error when order not found or not in pending state', async () => {
      // Arrange
      req.params = { orderId: 'order123' }
      req.body = { token_id: 'token123' }

      // Mock mongoose isValid
      mongoose.Types.ObjectId.isValid = jest.fn().mockReturnValue(true)

      // Mock order not found
      ;(OrderModel.findOne as jest.Mock).mockResolvedValue(null)

      // Act & Assert
      await expect(
        orderController.processPayment(req as Request, res as Response)
      ).rejects.toEqual(
        expect.objectContaining({
          status: 404,
          message:
            'Không tìm thấy đơn hàng hoặc đơn hàng không ở trạng thái chờ thanh toán',
        })
      )
    })

    test('should handle payment failure from payment processor', async () => {
      // Arrange
      req.params = { orderId: 'order123' }
      req.body = { token_id: 'token123' }

      // Mock mongoose isValid
      mongoose.Types.ObjectId.isValid = jest.fn().mockReturnValue(true)

      // Mock order model findOne
      const mockOrder = {
        _id: 'order123',
        user: 'user123',
        purchases: ['purchase1', 'purchase2'],
        total_amount: 400,
        shipping_fee: 30000,
        status: OrderStatus.PENDING,
        payment_method: 'recurly',
        save: jest.fn().mockResolvedValue(true),
      }
      ;(OrderModel.findOne as jest.Mock).mockResolvedValue(mockOrder)

      // Mock user model findById
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        name: 'Test User',
        save: jest.fn(),
      }
      ;(UserModel.findById as jest.Mock).mockResolvedValue(mockUser)

      // Mock payment failure
      const mockPaymentResult = {
        success: false,
        error: 'Payment declined',
        details: { error_code: 'card_declined' },
      }
      ;(recurlyService.processPayment as jest.Mock).mockResolvedValue(
        mockPaymentResult
      )

      // Act & Assert
      await expect(
        orderController.processPayment(req as Request, res as Response)
      ).rejects.toEqual(
        expect.objectContaining({
          status: 400,
          message: 'Thanh toán không thành công: Payment declined',
        })
      )

      // Check order was updated with error info
      expect(mockOrder.status).toBe(OrderStatus.PAYMENT_FAILED)
      expect(mockOrder.save).toHaveBeenCalled()
    })
  })

  describe('getAllOrders', () => {
    test('should get all orders with default pagination', async () => {
      // Arrange
      req.query = {}
      req.jwtDecoded = { id: 'user123' }

      // Mock countDocuments
      ;(OrderModel.countDocuments as jest.Mock).mockResolvedValue(5)

      // Mock find with chain
      const mockOrders = [
        { _id: 'order1', status: OrderStatus.PAID },
        { _id: 'order2', status: OrderStatus.PENDING },
      ]
      const mockFind = jest.fn().mockReturnThis()
      const mockPopulate = jest.fn().mockReturnThis()
      const mockSort = jest.fn().mockReturnThis()
      const mockSkip = jest.fn().mockReturnThis()
      const mockLimit = jest.fn().mockReturnThis()
      const mockLean = jest.fn().mockResolvedValue(mockOrders)

      ;(OrderModel.find as jest.Mock).mockImplementation(() => ({
        populate: mockPopulate,
        sort: mockSort,
        skip: mockSkip,
        limit: mockLimit,
        lean: mockLean,
      }))

      // Act
      await orderController.getAllOrders(req as Request, res as Response)

      // Assert
      expect(OrderModel.find).toHaveBeenCalledWith({ user: 'user123' })
      expect(mockPopulate).toHaveBeenCalled()
      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 })
      expect(mockSkip).toHaveBeenCalledWith(0) // (page 1 - 1) * 10
      expect(mockLimit).toHaveBeenCalledWith(10)
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Lấy danh sách đơn hàng thành công',
        data: {
          orders: mockOrders,
          pagination: {
            total: 5,
            page: 1,
            limit: 10,
            pages: 1,
          },
        },
      })
    })

    test('should get orders with status filter and pagination', async () => {
      // Arrange
      req.query = {
        page: '2',
        limit: '5',
        status: OrderStatus.PAID,
      }
      req.jwtDecoded = { id: 'user123' }

      // Mock countDocuments
      ;(OrderModel.countDocuments as jest.Mock).mockResolvedValue(12)

      // Mock find with chain
      const mockOrders = [{ _id: 'order3' }, { _id: 'order4' }]
      const mockFind = jest.fn().mockReturnThis()
      const mockPopulate = jest.fn().mockReturnThis()
      const mockSort = jest.fn().mockReturnThis()
      const mockSkip = jest.fn().mockReturnThis()
      const mockLimit = jest.fn().mockReturnThis()
      const mockLean = jest.fn().mockResolvedValue(mockOrders)

      ;(OrderModel.find as jest.Mock).mockImplementation(() => ({
        populate: mockPopulate,
        sort: mockSort,
        skip: mockSkip,
        limit: mockLimit,
        lean: mockLean,
      }))

      // Act
      await orderController.getAllOrders(req as Request, res as Response)

      // Assert
      expect(OrderModel.countDocuments).toHaveBeenCalledWith({
        user: 'user123',
        status: OrderStatus.PAID,
      })
      expect(OrderModel.find).toHaveBeenCalledWith({
        user: 'user123',
        status: OrderStatus.PAID,
      })
      expect(mockSkip).toHaveBeenCalledWith(5) // (page 2 - 1) * 5
      expect(mockLimit).toHaveBeenCalledWith(5)
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Lấy danh sách đơn hàng thành công',
        data: {
          orders: mockOrders,
          pagination: {
            total: 12,
            page: 2,
            limit: 5,
            pages: 3,
          },
        },
      })
    })
  })

  describe('getOrderDetail', () => {
    test('should get order detail successfully', async () => {
      // Arrange
      req.params = { order_id: 'order123' }
      req.jwtDecoded = { id: 'user123' }

      // Mock mongoose isValid
      mongoose.Types.ObjectId.isValid = jest.fn().mockReturnValue(true)

      // Mock order with chain
      const mockOrder = {
        _id: 'order123',
        user: 'user123',
        purchases: [
          { product: { name: 'Product 1', price: 100 }, buy_count: 2 },
          { product: { name: 'Product 2', price: 200 }, buy_count: 1 },
        ],
        total_amount: 400,
        shipping_fee: 30000,
        status: OrderStatus.PAID,
      }

      const mockFindOne = jest.fn().mockReturnThis()
      const mockPopulate = jest.fn().mockReturnThis()
      const mockLean = jest.fn().mockResolvedValue(mockOrder)

      ;(OrderModel.findOne as jest.Mock).mockImplementation(() => ({
        populate: mockPopulate,
        lean: mockLean,
      }))

      // Act
      await orderController.getOrderDetail(req as Request, res as Response)

      // Assert
      expect(mongoose.Types.ObjectId.isValid).toHaveBeenCalledWith('order123')
      expect(OrderModel.findOne).toHaveBeenCalledWith({
        _id: 'order123',
        user: 'user123',
      })
      expect(mockPopulate).toHaveBeenCalled()
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Lấy chi tiết đơn hàng thành công',
        data: {
          order: mockOrder,
          summary: {
            total_items: 2,
            total_amount: 400,
            shipping_fee: 30000,
            grand_total: 30400,
          },
        },
      })
    })

    test('should throw error when order ID is invalid', async () => {
      // Arrange
      req.params = { order_id: 'invalid-id' }
      req.jwtDecoded = { id: 'user123' }

      // Mock mongoose isValid
      mongoose.Types.ObjectId.isValid = jest.fn().mockReturnValue(false)

      // Act & Assert
      await expect(
        orderController.getOrderDetail(req as Request, res as Response)
      ).rejects.toEqual(
        expect.objectContaining({
          status: 400,
          message: 'ID đơn hàng không hợp lệ',
        })
      )
    })

    test('should throw error when order not found', async () => {
      // Arrange
      req.params = { order_id: 'order123' }
      req.jwtDecoded = { id: 'user123' }

      // Mock mongoose isValid
      mongoose.Types.ObjectId.isValid = jest.fn().mockReturnValue(true)

      // Mock order not found
      const mockFindOne = jest.fn().mockReturnThis()
      const mockPopulate = jest.fn().mockReturnThis()
      const mockLean = jest.fn().mockResolvedValue(null)

      ;(OrderModel.findOne as jest.Mock).mockImplementation(() => ({
        populate: mockPopulate,
        lean: mockLean,
      }))

      // Act & Assert
      await expect(
        orderController.getOrderDetail(req as Request, res as Response)
      ).rejects.toEqual(
        expect.objectContaining({
          status: 404,
          message: 'Không tìm thấy đơn hàng',
        })
      )
    })
  })
})
