// __tests__/purchase.controller.test.ts
import mongoose from 'mongoose'
import { Request, Response } from 'express'
import * as purchaseController from '../controllers/purchase.controller'
import { ProductModel } from '../database/models/product.model'
import { PurchaseModel } from '../database/models/purchase.model'
import { STATUS_PURCHASE } from '../constants/purchase'
import { STATUS } from '../constants/status'
import { responseSuccess, ErrorHandler } from '../utils/response'
import * as productController from '../controllers/product.controller'

// Mock dependencies
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

describe('Purchase Controller', () => {
  let req: Partial<Request>
  let res: Partial<Response>

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
      const mockAddedPurchase = { _id: 'purchase123', product: mockProduct }
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
      expect(mockSave).toHaveBeenCalled()
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
        product: mockProduct,
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

      // Act & Assert
      await expect(
        purchaseController.addToCart(req as Request, res as Response)
      ).rejects.toEqual({
        status: STATUS.NOT_ACCEPTABLE,
        message: 'Số lượng vượt quá số lượng sản phẩm',
        name: 'ErrorHandler',
      })
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

      // Act & Assert
      await expect(
        purchaseController.addToCart(req as Request, res as Response)
      ).rejects.toEqual({
        status: STATUS.NOT_FOUND,
        message: 'Không tìm thấy sản phẩm',
        name: 'ErrorHandler',
      })
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

    test('should throw error when buy_count exceeds product quantity', async () => {
      // Arrange
      req.body = {
        product_id: 'product123',
        buy_count: 20,
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

      // Act & Assert
      await expect(
        purchaseController.updatePurchase(req as Request, res as Response)
      ).rejects.toEqual({
        status: STATUS.NOT_ACCEPTABLE,
        message: 'Số lượng vượt quá số lượng sản phẩm',
        name: 'ErrorHandler',
      })
    })

    test('should throw error when purchase not found', async () => {
      // Arrange
      req.body = {
        product_id: 'product123',
        buy_count: 3,
      }

      // Mock not finding purchase
      ;(PurchaseModel.findOne as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      }))

      // Act & Assert
      await expect(
        purchaseController.updatePurchase(req as Request, res as Response)
      ).rejects.toEqual({
        status: STATUS.NOT_FOUND,
        message: 'Không tìm thấy đơn',
        name: 'ErrorHandler',
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

      // Mock product controller handleImageProduct
      ;(productController.handleImageProduct as jest.Mock).mockImplementation(
        (product) => ({
          ...product,
          image: `processed_${product.image}`,
        })
      )

      // Act
      await purchaseController.getPurchases(req as Request, res as Response)

      // Assert
      expect(PurchaseModel.find).toHaveBeenCalledWith({
        user: 'user123',
        status: '1',
      })
      expect(productController.handleImageProduct).toHaveBeenCalledTimes(2)
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Lấy đơn mua thành công',
        data: expect.arrayContaining([
          expect.objectContaining({
            _id: 'purchase1',
            product: expect.objectContaining({
              _id: 'product1',
              image: 'processed_image1.jpg',
            }),
          }),
        ]),
      })
    })

    test('should get all purchases except those in cart when status is ALL', async () => {
      // Arrange
      req.query = { status: STATUS_PURCHASE.ALL.toString() }
      req.jwtDecoded = { id: 'user123' }

      const mockPurchases = [
        {
          _id: 'purchase1',
          status: STATUS_PURCHASE.IN_CART,
          product: { _id: 'product1', name: 'Product 1' },
        },
        {
          _id: 'purchase2',
          status: STATUS_PURCHASE.IN_CART,
          product: { _id: 'product2', name: 'Product 2' },
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
        status: {
          $ne: STATUS_PURCHASE.IN_CART,
        },
      })
    })
  })

  describe('getPurchaseById', () => {
    test('should get purchase by ID successfully', async () => {
      // Arrange
      req.params = { purchase_id: 'purchase123' }
      req.jwtDecoded = { id: 'user123' }

      const mockPurchase = {
        _id: 'purchase123',
        user: 'user123',
        product: {
          _id: 'product123',
          name: 'Test Product',
          image: 'image.jpg',
        },
        buy_count: 2,
        price: 100,
      }

      ;(PurchaseModel.findOne as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockPurchase),
      }))

      // Act
      await purchaseController.getPurchaseById(req as Request, res as Response)

      // Assert
      expect(PurchaseModel.findOne).toHaveBeenCalledWith({
        user: 'user123',
        _id: 'purchase123',
      })
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Lấy đơn mua thành công',
        data: mockPurchase,
      })
    })

    test('should throw error when purchase not found', async () => {
      // Arrange
      req.params = { purchase_id: 'nonexistent' }
      req.jwtDecoded = { id: 'user123' }
      ;(PurchaseModel.findOne as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      }))

      // Act & Assert
      await expect(
        purchaseController.getPurchaseById(req as Request, res as Response)
      ).rejects.toEqual({
        status: STATUS.NOT_FOUND,
        message: 'Không tìm thấy đơn hàng',
        name: 'ErrorHandler',
      })
    })
  })

  describe('deletePurchases', () => {
    test('should delete purchases successfully', async () => {
      // Arrange
      req.body = ['purchase1', 'purchase2']
      req.jwtDecoded = { id: 'user123' }

      const mockDeletedData = {
        deletedCount: 2,
      }

      ;(PurchaseModel.deleteMany as jest.Mock).mockResolvedValue(
        mockDeletedData
      )

      // Act
      await purchaseController.deletePurchases(req as Request, res as Response)

      // Assert
      expect(PurchaseModel.deleteMany).toHaveBeenCalledWith({
        user: 'user123',
        status: STATUS_PURCHASE.IN_CART,
        _id: { $in: ['purchase1', 'purchase2'] },
      })
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Xoá 2 đơn thành công',
        data: { deleted_count: 2 },
      })
    })

    test('should handle no purchases deleted', async () => {
      // Arrange
      req.body = ['nonexistent1', 'nonexistent2']
      req.jwtDecoded = { id: 'user123' }

      const mockDeletedData = {
        deletedCount: 0,
      }

      ;(PurchaseModel.deleteMany as jest.Mock).mockResolvedValue(
        mockDeletedData
      )

      // Act
      await purchaseController.deletePurchases(req as Request, res as Response)

      // Assert
      expect(PurchaseModel.deleteMany).toHaveBeenCalled()
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Xoá 0 đơn thành công',
        data: { deleted_count: 0 },
      })
    })
  })

  describe('addToCart - Enhanced Tests', () => {
    test('should throw error when product_id is not provided', async () => {
      // Arrange
      req.body = {
        buy_count: 2,
        // Missing product_id
      }

      // Act & Assert
      await expect(
        purchaseController.addToCart(req as Request, res as Response)
      ).rejects.toEqual(
        expect.objectContaining({
          name: 'ErrorHandler',
        })
      )
    })

    test('should throw error when buy_count is not provided', async () => {
      // Arrange
      req.body = {
        product_id: 'product123',
        // Missing buy_count
      }

      // Mock product model findById
      const mockProduct = {
        _id: 'product123',
        name: 'Test Product',
        price: 1000,
        price_before_discount: 1200,
        quantity: 10,
      }

      ;(ProductModel.findById as jest.Mock).mockImplementation(() => ({
        lean: jest.fn().mockResolvedValue(mockProduct),
      }))

      // Act & Assert
      await expect(
        purchaseController.addToCart(req as Request, res as Response)
      ).rejects.toEqual(
        expect.objectContaining({
          name: 'ErrorHandler',
        })
      )
    })

    test('should throw error when buy_count is zero or negative', async () => {
      // Arrange
      req.body = {
        product_id: 'product123',
        buy_count: 0,
      }

      // Mock product model findById
      const mockProduct = {
        _id: 'product123',
        name: 'Test Product',
        price: 1000,
        price_before_discount: 1200,
        quantity: 10,
      }

      ;(ProductModel.findById as jest.Mock).mockImplementation(() => ({
        lean: jest.fn().mockResolvedValue(mockProduct),
      }))

      // Act & Assert
      await expect(
        purchaseController.addToCart(req as Request, res as Response)
      ).rejects.toEqual(
        expect.objectContaining({
          status: expect.any(Number),
          message: expect.any(String),
          name: 'ErrorHandler',
        })
      )
    })

    test('should handle adding product with existing product in cart at max quantity', async () => {
      // Arrange
      req.body = {
        product_id: 'product123',
        buy_count: 1,
      }

      // Mock product model findById
      const mockProduct = {
        _id: 'product123',
        name: 'Test Product',
        price: 1000,
        price_before_discount: 1200,
        quantity: 10,
      }

      // Mock finding existing purchase with quantity = 9
      const mockExistingPurchase = {
        _id: 'purchase123',
        product: 'product123',
        buy_count: 9,
        price: 1000,
        price_before_discount: 1200,
        status: STATUS_PURCHASE.IN_CART,
      }

      // Mock updated purchase with quantity = 10
      const mockUpdatedPurchase = {
        ...mockExistingPurchase,
        buy_count: 10,
        product: mockProduct,
      }

      ;(ProductModel.findById as jest.Mock).mockImplementation(() => ({
        lean: jest.fn().mockResolvedValue(mockProduct),
      }))
      ;(PurchaseModel.findOne as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockExistingPurchase),
      }))
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
          buy_count: 10, // 9 + 1
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

    test('should throw error when trying to add product with unavailable quantity', async () => {
      // Arrange
      req.body = {
        product_id: 'product123',
        buy_count: 2,
      }

      // Mock product with quantity 0
      const mockProduct = {
        _id: 'product123',
        name: 'Test Product',
        price: 1000,
        price_before_discount: 1200,
        quantity: 0, // Product is out of stock
      }

      ;(ProductModel.findById as jest.Mock).mockImplementation(() => ({
        lean: jest.fn().mockResolvedValue(mockProduct),
      }))

      // Act & Assert
      await expect(
        purchaseController.addToCart(req as Request, res as Response)
      ).rejects.toEqual({
        status: STATUS.NOT_ACCEPTABLE,
        message: 'Số lượng vượt quá số lượng sản phẩm',
        name: 'ErrorHandler',
      })
    })
  })

  describe('updatePurchase - Enhanced Tests', () => {
    test('should update purchase with minimum quantity', async () => {
      // Arrange
      req.body = {
        product_id: 'product123',
        buy_count: 1, // Minimum quantity
      }

      // Mock finding purchase
      const mockPurchase = {
        _id: 'purchase123',
        product: {
          _id: 'product123',
          quantity: 10,
          name: 'Test Product',
          category: { _id: 'category1', name: 'Electronics' },
          shop: { _id: 'shop1', name: 'Test Shop' },
        },
        buy_count: 5,
      }

      const mockUpdatedPurchase = {
        ...mockPurchase,
        buy_count: 1,
      }

      ;(PurchaseModel.findOne as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockPurchase),
      }))
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
          buy_count: 1,
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

    test('should update purchase to maximum available quantity', async () => {
      // Arrange
      req.body = {
        product_id: 'product123',
        buy_count: 10, // Maximum quantity
      }

      // Mock finding purchase
      const mockPurchase = {
        _id: 'purchase123',
        product: {
          _id: 'product123',
          quantity: 10,
          name: 'Test Product',
          category: { _id: 'category1', name: 'Electronics' },
          shop: { _id: 'shop1', name: 'Test Shop' },
        },
        buy_count: 5,
      }

      const mockUpdatedPurchase = {
        ...mockPurchase,
        buy_count: 10,
      }

      ;(PurchaseModel.findOne as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockPurchase),
      }))
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
          buy_count: 10,
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

  describe('getPurchases - Enhanced Tests', () => {
    test('should return empty array when no purchases found', async () => {
      // Arrange
      req.query = { status: '1' }
      req.jwtDecoded = { id: 'user123' }

      // Mock empty purchases array
      const emptyPurchases = []

      ;(PurchaseModel.find as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(emptyPurchases),
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
        data: [],
      })
    })

    test('should handle various purchase status filters correctly', async () => {
      // Arrange - Testing with status 2 (PROCESSING)
      req.query = { status: '2' }
      req.jwtDecoded = { id: 'user123' }

      const mockPurchases = [
        {
          _id: 'purchase1',
          status: STATUS_PURCHASE.IN_CART,
          product: { _id: 'product1', name: 'Product 1' },
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
        status: '2',
      })

      // Clear mock and test another status
      jest.clearAllMocks()
      req.query = { status: '3' } // DELIVERED

      // Act again
      await purchaseController.getPurchases(req as Request, res as Response)

      // Assert again
      expect(PurchaseModel.find).toHaveBeenCalledWith({
        user: 'user123',
        status: '3',
      })
    })

    test('should exclude items with IN_CART status when fetching all purchases', async () => {
      // Arrange
      req.query = { status: STATUS_PURCHASE.ALL.toString() }
      req.jwtDecoded = { id: 'user123' }

      const mockPurchases = [
        {
          _id: 'purchase1',
          status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION,
          product: { _id: 'product1', name: 'Product 1' },
        },
        {
          _id: 'purchase2',
          status: STATUS_PURCHASE.IN_CART,
          product: { _id: 'product2', name: 'Product 2' },
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
        status: {
          $ne: STATUS_PURCHASE.IN_CART,
        },
      })
    })
  })

  describe('getPurchaseById - Enhanced Tests', () => {
    test('should handle invalid purchase ID format', async () => {
      // Arrange
      req.params = { purchase_id: 'invalid-id' }
      req.jwtDecoded = { id: 'user123' }

      // Mock mongoose error for invalid ID
      ;(PurchaseModel.findOne as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid ID format')
      })

      // Act & Assert
      await expect(
        purchaseController.getPurchaseById(req as Request, res as Response)
      ).rejects.toThrow('Invalid ID format')
    })

    test('should return purchase with populated product data', async () => {
      // Arrange
      req.params = { purchase_id: 'purchase123' }
      req.jwtDecoded = { id: 'user123' }

      const mockPurchase = {
        _id: 'purchase123',
        user: 'user123',
        product: {
          _id: 'product123',
          name: 'Test Product',
          price: 1000,
          images: ['image1.jpg'],
          category: { _id: 'category1', name: 'Electronics' },
          shop: { _id: 'shop1', name: 'Test Shop' },
        },
        buy_count: 2,
        price: 1000,
        status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION,
      }

      // Mock image handling
      const processedProduct = {
        ...mockPurchase.product,
        image: 'processed_image1.jpg',
      }

      ;(PurchaseModel.findOne as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockPurchase),
      }))
      ;(productController.handleImageProduct as jest.Mock).mockReturnValue(
        processedProduct
      )

      // Act
      await purchaseController.getPurchaseById(req as Request, res as Response)

      // Assert
      expect(PurchaseModel.findOne).toHaveBeenCalledWith({
        user: 'user123',
        _id: 'purchase123',
      })
      expect(productController.handleImageProduct).toHaveBeenCalledWith(
        mockPurchase.product
      )
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Lấy đơn mua thành công',
        data: {
          ...mockPurchase,
          product: processedProduct,
        },
      })
    })
  })

  describe('deletePurchases - Enhanced Tests', () => {
    test('should handle deletion with empty purchase IDs array', async () => {
      // Arrange
      req.body = [] // Empty array of IDs
      req.jwtDecoded = { id: 'user123' }

      const mockDeletedData = {
        deletedCount: 0,
      }

      ;(PurchaseModel.deleteMany as jest.Mock).mockResolvedValue(
        mockDeletedData
      )

      // Act
      await purchaseController.deletePurchases(req as Request, res as Response)

      // Assert
      expect(PurchaseModel.deleteMany).toHaveBeenCalledWith({
        user: 'user123',
        status: STATUS_PURCHASE.IN_CART,
        _id: { $in: [] },
      })
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Xoá 0 đơn thành công',
        data: { deleted_count: 0 },
      })
    })

    test('should handle deletion with non-array input', async () => {
      // Arrange - simulating incorrect client input (single string instead of array)
      req.body = 'purchase123'
      req.jwtDecoded = { id: 'user123' }

      // Mock deleteMany
      ;(PurchaseModel.deleteMany as jest.Mock).mockImplementation(() => {
        throw new Error('Purchase IDs must be an array')
      })

      // Act & Assert
      await expect(
        purchaseController.deletePurchases(req as Request, res as Response)
      ).rejects.toThrow('Purchase IDs must be an array')
    })

    test('should delete only purchases in cart status', async () => {
      // Arrange
      req.body = ['purchase1', 'purchase2', 'purchase3']
      req.jwtDecoded = { id: 'user123' }

      const mockDeletedData = {
        deletedCount: 2, // Only 2 of the 3 were in cart status
      }

      ;(PurchaseModel.deleteMany as jest.Mock).mockResolvedValue(
        mockDeletedData
      )

      // Act
      await purchaseController.deletePurchases(req as Request, res as Response)

      // Assert
      expect(PurchaseModel.deleteMany).toHaveBeenCalledWith({
        user: 'user123',
        status: STATUS_PURCHASE.IN_CART, // Only deleting items in cart status
        _id: { $in: ['purchase1', 'purchase2', 'purchase3'] },
      })
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Xoá 2 đơn thành công',
        data: { deleted_count: 2 },
      })
    })

    test('should handle database error during deletion', async () => {
      // Arrange
      req.body = ['purchase1', 'purchase2']
      req.jwtDecoded = { id: 'user123' }

      // Mock database error
      const dbError = new Error('Database connection error')
      ;(PurchaseModel.deleteMany as jest.Mock).mockRejectedValue(dbError)

      // Act & Assert
      await expect(
        purchaseController.deletePurchases(req as Request, res as Response)
      ).rejects.toThrow('Database connection error')
    })
  })
})
