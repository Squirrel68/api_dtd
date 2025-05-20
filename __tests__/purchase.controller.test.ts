// __tests__/purchase.controller.test.ts
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { Request, Response } from 'express'
import * as purchaseController from '../controllers/purchase.controller'
import { ProductModel } from '../database/models/product.model'
import { PurchaseModel } from '../database/models/purchase.model'
import { STATUS_PURCHASE } from '../constants/purchase'
import { responseSuccess, ErrorHandler } from '../utils/response'

// Mock các dependencies
jest.mock('../database/models/product.model')
jest.mock('../database/models/purchase.model')
jest.mock('../utils/response', () => ({
  responseSuccess: jest.fn(),
  ErrorHandler: jest.fn().mockImplementation((status, message) => ({
    status,
    message,
    name: 'ErrorHandler',
  })),
}))
jest.mock('../controllers/product.controller', () => ({
  handleImageProduct: jest.fn((product) => product),
}))
jest.mock('lodash', () => ({
  cloneDeep: jest.fn((obj) => obj),
}))

let mongoServer: MongoMemoryServer

describe('Purchase Controller', () => {
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

  describe('addToCart', () => {
    test('should add product to cart successfully when product exists and not in cart', async () => {
      // Arrange
      req.body = {
        product_id: 'product123',
        buy_count: 2,
      }

      // Mock product model findById
      const mockProduct = {
        _id: 'product123',
        name: 'Test Product',
        price: 100,
        price_before_discount: 120,
        quantity: 10,
      }

      ;(ProductModel.findById as jest.Mock).mockImplementation(() => ({
        lean: jest.fn().mockResolvedValue(mockProduct),
      }))

      // Mock not finding existing purchase
      ;(PurchaseModel.findOne as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      }))

      // Mock creating new purchase
      const mockAddedPurchase = { _id: 'purchase123' }
      const mockSave = jest.fn().mockResolvedValue(mockAddedPurchase)

      ;(PurchaseModel as unknown as jest.Mock).mockImplementation(() => ({
        save: mockSave,
      }))

      // Mock findById after save
      ;(PurchaseModel.findById as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockAddedPurchase),
      }))

      // Act
      await purchaseController.addToCart(req as Request, res as Response)

      // Assert
      expect(ProductModel.findById).toHaveBeenCalledWith('product123')
      expect(PurchaseModel.findOne).toHaveBeenCalledWith({
        user: 'user123',
        status: STATUS_PURCHASE.IN_CART,
        product: 'product123',
      })
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Thêm sản phẩm vào giỏ hàng thành công',
        data: mockAddedPurchase,
      })
    })

    test('should update buy_count when product already in cart', async () => {
      // Arrange
      req.body = {
        product_id: 'product123',
        buy_count: 1,
      }

      // Mock product model findById
      const mockProduct = {
        _id: 'product123',
        name: 'Test Product',
        price: 100,
        price_before_discount: 120,
        quantity: 10,
      }

      ;(ProductModel.findById as jest.Mock).mockImplementation(() => ({
        lean: jest.fn().mockResolvedValue(mockProduct),
      }))

      // Mock finding existing purchase with buy_count = 1
      const mockPurchaseInDb = {
        _id: 'purchase123',
        buy_count: 1,
      }

      ;(PurchaseModel.findOne as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockPurchaseInDb),
      }))

      // Mock updating purchase
      const mockUpdatedPurchase = { ...mockPurchaseInDb, buy_count: 2 }

      ;(PurchaseModel.findOneAndUpdate as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUpdatedPurchase),
      }))

      // Act
      await purchaseController.addToCart(req as Request, res as Response)

      // Assert
      expect(PurchaseModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          user: 'user123',
          status: STATUS_PURCHASE.IN_CART,
          product: 'product123',
        },
        {
          buy_count: 2, // 1 (existing) + 1 (new)
        },
        {
          new: true,
        }
      )

      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Thêm sản phẩm vào giỏ hàng thành công',
        data: mockUpdatedPurchase,
      })
    })

    test('should throw error when product quantity is less than buy_count', async () => {
      // Arrange
      req.body = {
        product_id: 'product123',
        buy_count: 15,
      }

      // Mock product model findById
      const mockProduct = {
        _id: 'product123',
        quantity: 10,
      }

      ;(ProductModel.findById as jest.Mock).mockImplementation(() => ({
        lean: jest.fn().mockResolvedValue(mockProduct),
      }))

      // Act & Assert using try/catch
      try {
        await purchaseController.addToCart(req as Request, res as Response)
        fail('Expected function to throw an error but it did not')
      } catch (error) {
        expect(error.status).toBe(406)
        expect(error.message).toBe('Số lượng vượt quá số lượng sản phẩm')
      }
    })

    test('should throw error when product not found', async () => {
      // Arrange
      req.body = {
        product_id: 'nonexistent',
        buy_count: 1,
      }

      // Mock product model findById
      ;(ProductModel.findById as jest.Mock).mockImplementation(() => ({
        lean: jest.fn().mockResolvedValue(null),
      }))

      // Act & Assert using try/catch
      try {
        await purchaseController.addToCart(req as Request, res as Response)
        fail('Expected function to throw an error but it did not')
      } catch (error) {
        expect(error.status).toBe(404)
        expect(error.message).toBe('Không tìm thấy sản phẩm')
      }
    })
  })

  describe('updatePurchase', () => {
    test('should update purchase buy_count successfully', async () => {
      // Arrange
      req.body = {
        product_id: 'product123',
        buy_count: 3,
      }

      // Mock finding purchase
      const mockPurchase = {
        _id: 'purchase123',
        product: {
          _id: 'product123',
          quantity: 10,
        },
        buy_count: 1,
      }

      ;(PurchaseModel.findOne as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockPurchase),
      }))

      // Mock updating purchase
      const mockUpdatedPurchase = { ...mockPurchase, buy_count: 3 }

      ;(PurchaseModel.findOneAndUpdate as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUpdatedPurchase),
      }))

      // Act
      await purchaseController.updatePurchase(req as Request, res as Response)

      // Assert
      expect(PurchaseModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          user: 'user123',
          status: STATUS_PURCHASE.IN_CART,
          product: 'product123',
        },
        {
          buy_count: 3,
        },
        {
          new: true,
        }
      )

      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Cập nhật đơn thành công',
        data: mockUpdatedPurchase,
      })
    })
  })

  describe('getPurchases', () => {
    test('should get purchases successfully with status filter', async () => {
      // Arrange
      req.query = { status: '1' } // WAIT_FOR_CONFIRMATION
      req.jwtDecoded = { id: 'user123' }

      const mockPurchases = [
        {
          _id: 'purchase1',
          product: { _id: 'product1', name: 'Product 1', image: 'image1.jpg' },
        },
        {
          _id: 'purchase2',
          product: { _id: 'product2', name: 'Product 2', image: 'image2.jpg' },
        },
      ]

      ;(PurchaseModel.find as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockPurchases),
      }))

      // Act
      await purchaseController.getPurchases(req as Request, res as Response)

      // Assert
      expect(PurchaseModel.find).toHaveBeenCalledWith({
        user: 'user123',
        status: '1',
      })

      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Lấy đơn mua thành công',
        data: expect.any(Array),
      })
    })
  })
})
