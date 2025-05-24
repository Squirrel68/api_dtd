// __tests__/product.controller.test.ts
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { Request, Response } from 'express'
import { ProductModel } from '../database/models/product.model'
import { UserModel } from '../database/models/user.model'
import { SearchHistoryModel } from '../database/models/search.model'
import ProductController, {
  handleImageProduct,
} from '../controllers/product.controller'
import { responseSuccess, ErrorHandler } from '../utils/response'
import { HOST, ROUTE_IMAGE } from '../constants/config'
import * as cloudinary from 'cloudinary'
import fs from 'fs'

// Mock the dependencies
jest.mock('../database/models/product.model')
jest.mock('../database/models/user.model')
jest.mock('../database/models/search.model')
jest.mock('../utils/response', () => ({
  responseSuccess: jest.fn(),
  ErrorHandler: jest.fn().mockImplementation((status, message) => ({
    status,
    message,
    name: 'ErrorHandler',
  })),
}))
jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: jest.fn(),
      destroy: jest.fn(),
    },
  },
}))
jest.mock('fs', () => ({
  unlink: jest.fn(),
}))
jest.mock('streamifier', () => ({
  createReadStream: jest.fn().mockReturnValue({
    pipe: jest.fn(),
  }),
}))

// Mock config constants
jest.mock('../constants/config', () => ({
  HOST: 'http://undefined:undefined',
  ROUTE_IMAGE: 'images',
  FOLDERS: {
    PRODUCT: 'product',
  },
  FOLDER_UPLOAD: 'uploads',
}))

let mongoServer: MongoMemoryServer

describe('Product Controller', () => {
  let req: Partial<Request>
  let res: Partial<Response>

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI || '')
  })

  afterAll(async () => {
    await mongoose.disconnect()
  })

  beforeEach(() => {
    req = {
      jwtDecoded: { id: 'user123' },
      body: {},
      params: {},
      query: {},
      file: null,
      files: null,
    }
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }
    jest.clearAllMocks()
  })

  describe('handleImageProduct', () => {
    test('should process image URL when not starting with http', () => {
      const product = {
        _id: 'product123',
        name: 'Test Product',
        image: 'test-image.jpg',
        images: ['image1.jpg', 'image2.jpg', ''],
      }

      const result = handleImageProduct(product)

      expect(result.image).toBe(`${HOST}/${ROUTE_IMAGE}/test-image.jpg`)
      expect(result.images[0]).toBe(`${HOST}/${ROUTE_IMAGE}/image1.jpg`)
      expect(result.images[1]).toBe(`${HOST}/${ROUTE_IMAGE}/image2.jpg`)
      expect(result.images[2]).toBe('')
    })

    test('should not modify URLs that already start with http', () => {
      const product = {
        _id: 'product123',
        name: 'Test Product',
        image: 'https://example.com/image.jpg',
        images: [
          'https://example.com/image1.jpg',
          'http://example.com/image2.jpg',
        ],
      }

      const result = handleImageProduct(product)

      expect(result.image).toBe('https://example.com/image.jpg')
      expect(result.images[0]).toBe('https://example.com/image1.jpg')
      expect(result.images[1]).toBe('http://example.com/image2.jpg')
    })

    test('should handle product with no image or images', () => {
      const product = {
        _id: 'product123',
        name: 'Test Product',
      }

      const result = handleImageProduct(product)

      expect(result).toEqual(product)
    })
  })

  describe('addProduct', () => {
    test('should create a new product successfully', async () => {
      // Arrange
      req.body = {
        name: 'New Product',
        description: 'Product description',
        category: 'category123',
        image: 'image.jpg',
        images: ['image1.jpg', 'image2.jpg'],
        price: 100,
        rating: 4.5,
        price_before_discount: 120,
        quantity: 50,
        sold: 0,
        view: 0,
      }
      req.jwtDecoded = { id: 'user123' }

      const mockProduct = {
        _id: 'product123',
        name: 'New Product',
        description: 'Product description',
        category: 'category123',
        image: 'image.jpg',
        images: ['image1.jpg', 'image2.jpg'],
        price: 100,
        rating: 4.5,
        price_before_discount: 120,
        quantity: 50,
        sold: 0,
        view: 0,
        shop: 'user123',
      }

      const mockSave = jest.fn().mockResolvedValue({ _id: 'product123' })
      ;(ProductModel as any).mockImplementation(() => ({
        save: mockSave,
      }))

      const mockPopulatedProduct = {
        ...mockProduct,
        category: { _id: 'category123', name: 'Electronics' },
        shop: { _id: 'user123', name: 'Test Shop' },
      }

      ;(ProductModel.findById as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockPopulatedProduct),
      }))

      // Act
      await ProductController.addProduct(req as Request, res as Response)

      // Assert
      expect(ProductModel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Product',
          description: 'Product description',
          category: 'category123',
          shop: 'user123',
        })
      )
      expect(mockSave).toHaveBeenCalled()
      expect(ProductModel.findById).toHaveBeenCalledWith('product123')
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Tạo sản phẩm thành công',
        data: expect.objectContaining({
          _id: 'product123',
          name: 'New Product',
        }),
      })
    })

    test('should handle price_before_discount from different field names', async () => {
      // Arrange
      req.body = {
        name: 'New Product',
        category: 'category123',
        price: 100,
        priceBeforeDiscount: 120, // Using the alternative field name
      }
      req.jwtDecoded = { id: 'user123' }

      const mockSave = jest.fn().mockResolvedValue({ _id: 'product123' })
      ;(ProductModel as any).mockImplementation(() => ({
        save: mockSave,
      }))

      const mockPopulatedProduct = {
        _id: 'product123',
        name: 'New Product',
        price: 100,
        price_before_discount: 120, // Field should be normalized
        shop: { _id: 'user123', name: 'Test Shop' },
        category: { _id: 'category123', name: 'Electronics' },
      }

      ;(ProductModel.findById as jest.Mock).mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockPopulatedProduct),
      }))

      // Act
      await ProductController.addProduct(req as Request, res as Response)

      // Assert
      expect(ProductModel).toHaveBeenCalledWith(
        expect.objectContaining({
          price_before_discount: 120,
        })
      )
    })
  })

  describe('getProducts', () => {
    test('should get products with default pagination', async () => {
      // Arrange
      req.query = {}

      const mockProducts = [
        { _id: 'product1', name: 'Product 1', image: 'image1.jpg' },
        { _id: 'product2', name: 'Product 2', image: 'image2.jpg' },
      ]

      const mockFind = jest.fn().mockReturnThis()
      const mockPopulate = jest.fn().mockReturnThis()
      const mockSort = jest.fn().mockReturnThis()
      const mockSkip = jest.fn().mockReturnThis()
      const mockLimit = jest.fn().mockReturnThis()
      const mockSelect = jest.fn().mockReturnThis()
      const mockLean = jest.fn().mockResolvedValue(mockProducts)
      const mockCountDocuments = jest.fn().mockReturnThis()
      const mockCountLean = jest.fn().mockResolvedValue(10)

      ;(ProductModel.find as jest.Mock).mockImplementation(() => ({
        populate: mockPopulate,
        sort: mockSort,
        skip: mockSkip,
        limit: mockLimit,
        select: mockSelect,
        lean: mockLean,
        countDocuments: mockCountDocuments,
      }))
      ;(ProductModel.find().countDocuments as jest.Mock).mockImplementation(
        () => ({
          lean: mockCountLean,
        })
      )

      // Act
      await ProductController.getProducts(req as Request, res as Response)

      // Assert
      expect(ProductModel.find).toHaveBeenCalledWith({})
      expect(mockPopulate).toHaveBeenCalled()
      expect(mockSort).toHaveBeenCalled()
      expect(mockSkip).toHaveBeenCalledWith(0) // (page 1 - 1) * 30
      expect(mockLimit).toHaveBeenCalledWith(30) // Default limit
      expect(responseSuccess).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          message: 'Lấy các sản phẩm thành công',
        })
      )
    })

    test('should save search history when name and userId are provided', async () => {
      // Arrange
      req.query = {
        name: 'test',
        userId: 'user123',
      }

      // Mock SearchHistoryModel.create
      ;(SearchHistoryModel.create as jest.Mock).mockResolvedValue({
        _id: 'search123',
      })

      const mockProducts = []
      const mockFind = jest.fn().mockReturnThis()
      const mockPopulate = jest.fn().mockReturnThis()
      const mockSort = jest.fn().mockReturnThis()
      const mockSkip = jest.fn().mockReturnThis()
      const mockLimit = jest.fn().mockReturnThis()
      const mockSelect = jest.fn().mockReturnThis()
      const mockLean = jest.fn().mockResolvedValue(mockProducts)
      const mockCountDocuments = jest.fn().mockReturnThis()
      const mockCountLean = jest.fn().mockResolvedValue(0)

      ;(ProductModel.find as jest.Mock).mockImplementation(() => ({
        populate: mockPopulate,
        sort: mockSort,
        skip: mockSkip,
        limit: mockLimit,
        select: mockSelect,
        lean: mockLean,
        countDocuments: mockCountDocuments,
      }))
      ;(ProductModel.find().countDocuments as jest.Mock).mockImplementation(
        () => ({
          lean: mockCountLean,
        })
      )

      // Act
      await ProductController.getProducts(req as Request, res as Response)

      // Assert
      expect(SearchHistoryModel.create).toHaveBeenCalledWith({
        user: 'user123',
        search: 'test',
      })
      expect(ProductModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          name: {
            $regex: 'test',
            $options: 'i',
          },
        })
      )
    })

    test('should apply filters correctly', async () => {
      // Arrange
      req.query = {
        page: '2',
        limit: '10',
        category: 'category123',
        exclude: 'product1',
        rating_filter: '4',
        price_min: '50',
        price_max: '200',
        sort_by: 'price',
        order: 'desc',
      }

      const mockProducts = [
        { _id: 'product2', name: 'Product 2', price: 180 },
        { _id: 'product3', name: 'Product 3', price: 150 },
      ]

      const mockFind = jest.fn().mockReturnThis()
      const mockPopulate = jest.fn().mockReturnThis()
      const mockSort = jest.fn().mockReturnThis()
      const mockSkip = jest.fn().mockReturnThis()
      const mockLimit = jest.fn().mockReturnThis()
      const mockSelect = jest.fn().mockReturnThis()
      const mockLean = jest.fn().mockResolvedValue(mockProducts)
      const mockCountDocuments = jest.fn().mockReturnThis()
      const mockCountLean = jest.fn().mockResolvedValue(5)

      ;(ProductModel.find as jest.Mock).mockImplementation(() => ({
        populate: mockPopulate,
        sort: mockSort,
        skip: mockSkip,
        limit: mockLimit,
        select: mockSelect,
        lean: mockLean,
        countDocuments: mockCountDocuments,
      }))
      ;(ProductModel.find().countDocuments as jest.Mock).mockImplementation(
        () => ({
          lean: mockCountLean,
        })
      )

      // Act
      await ProductController.getProducts(req as Request, res as Response)

      // Assert
      expect(ProductModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'category123',
          _id: { $ne: 'product1' },
          rating: { $gte: '4' },
          price: { $gte: '50', $lte: '200' },
        })
      )
      expect(mockSkip).toHaveBeenCalledWith(10) // (page 2 - 1) * 10
      expect(mockLimit).toHaveBeenCalledWith(10)
      expect(mockSort).toHaveBeenCalledWith({ price: -1 }) // desc order
    })
  })

  describe('getAllProducts', () => {
    test('should get all products without category filter', async () => {
      // Arrange
      req.query = {}

      const mockProducts = [
        { _id: 'product1', name: 'Product 1' },
        { _id: 'product2', name: 'Product 2' },
      ]

      const mockFind = jest.fn().mockReturnThis()
      const mockPopulate = jest.fn().mockReturnThis()
      const mockSort = jest.fn().mockReturnThis()
      const mockSelect = jest.fn().mockReturnThis()
      const mockLean = jest.fn().mockResolvedValue(mockProducts)

      ;(ProductModel.find as jest.Mock).mockImplementation(() => ({
        populate: mockPopulate,
        sort: mockSort,
        select: mockSelect,
        lean: mockLean,
      }))

      // Act
      await ProductController.getAllProducts(req as Request, res as Response)

      // Assert
      expect(ProductModel.find).toHaveBeenCalledWith({})
      expect(mockPopulate).toHaveBeenCalledWith({ path: 'category' })
      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 })
      expect(mockSelect).toHaveBeenCalledWith({ __v: 0, description: 0 })
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Lấy tất cả sản phẩm thành công',
        data: mockProducts,
      })
    })

    test('should get all products with category filter', async () => {
      // Arrange
      req.query = { category: 'category123' }

      const mockProducts = [
        {
          _id: 'product1',
          name: 'Product 1',
          category: { _id: 'category123', name: 'Electronics' },
        },
      ]

      const mockFind = jest.fn().mockReturnThis()
      const mockPopulate = jest.fn().mockReturnThis()
      const mockSort = jest.fn().mockReturnThis()
      const mockSelect = jest.fn().mockReturnThis()
      const mockLean = jest.fn().mockResolvedValue(mockProducts)

      ;(ProductModel.find as jest.Mock).mockImplementation(() => ({
        populate: mockPopulate,
        sort: mockSort,
        select: mockSelect,
        lean: mockLean,
      }))

      // Act
      await ProductController.getAllProducts(req as Request, res as Response)

      // Assert
      expect(ProductModel.find).toHaveBeenCalledWith({
        category: 'category123',
      })
    })
  })

  describe('getMyProducts', () => {
    test('should get all products for the current user', async () => {
      // Arrange
      req.jwtDecoded = { id: 'user123' }

      const mockProducts = [
        { _id: 'product1', name: 'Product 1', shop: 'user123' },
        { _id: 'product2', name: 'Product 2', shop: 'user123' },
      ]

      const mockFind = jest.fn().mockReturnThis()
      const mockPopulate = jest.fn().mockReturnThis()
      const mockSort = jest.fn().mockReturnThis()
      const mockSelect = jest.fn().mockReturnThis()
      const mockLean = jest.fn().mockResolvedValue(mockProducts)

      ;(ProductModel.find as jest.Mock).mockImplementation(() => ({
        populate: mockPopulate,
        sort: mockSort,
        select: mockSelect,
        lean: mockLean,
      }))

      // Act
      await ProductController.getMyProducts(req as Request, res as Response)

      // Assert
      expect(ProductModel.find).toHaveBeenCalledWith({ shop: 'user123' })
      expect(mockPopulate).toHaveBeenCalledWith('category')
      expect(mockPopulate).toHaveBeenCalledWith('shop')
      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 })
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Lấy tất cả sản phẩm thành công',
        data: mockProducts,
      })
    })
  })

  describe('getProduct', () => {
    test('should get a product by ID and update view count', async () => {
      // Arrange
      req.params = { product_id: 'product123' }
      req.jwtDecoded = { id: 'user123' }

      // Mock UserModel.findById
      const mockUser = {
        _id: 'user123',
        watchList: ['product456'],
      }
      ;(UserModel.findById as jest.Mock).mockResolvedValue(mockUser)

      // Mock UserModel.findByIdAndUpdate
      ;(UserModel.findByIdAndUpdate as jest.Mock).mockResolvedValue(true)

      // Mock ProductModel.findOneAndUpdate
      const mockProduct = {
        _id: 'product123',
        name: 'Test Product',
        image: 'image.jpg',
      }
      const mockFindOneAndUpdate = jest.fn().mockReturnThis()
      const mockPopulate = jest.fn().mockReturnThis()
      const mockPopulateShop = jest.fn().mockReturnThis()
      const mockSelect = jest.fn().mockReturnThis()
      const mockLean = jest.fn().mockResolvedValue(mockProduct)

      ;(ProductModel.findOneAndUpdate as jest.Mock).mockImplementation(() => ({
        populate: mockPopulate,
        select: mockSelect,
        lean: mockLean,
      }))

      // Act
      await ProductController.getProduct(req as Request, res as Response)

      // Assert
      // Check if watchList was updated
      expect(UserModel.findById).toHaveBeenCalledWith('user123')
      expect(UserModel.findByIdAndUpdate).toHaveBeenCalledWith('user123', {
        watchList: expect.arrayContaining(['product456', 'product123']),
      })

      // Check if product view was incremented
      expect(ProductModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'product123' },
        { $inc: { view: 1 } },
        { new: true }
      )

      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Lấy sản phẩm thành công',
        data: mockProduct,
      })
    })

    test('should handle product not found', async () => {
      // Arrange
      req.params = { product_id: 'nonexistent' }
      req.jwtDecoded = { id: 'user123' }

      // Mock UserModel.findById
      ;(UserModel.findById as jest.Mock).mockResolvedValue({
        _id: 'user123',
        watchList: [],
      })

      // Mock ProductModel.findOneAndUpdate returns null (product not found)
      const mockFindOneAndUpdate = jest.fn().mockReturnThis()
      const mockPopulate = jest.fn().mockReturnThis()
      const mockSelect = jest.fn().mockReturnThis()
      const mockLean = jest.fn().mockResolvedValue(null)

      ;(ProductModel.findOneAndUpdate as jest.Mock).mockImplementation(() => ({
        populate: mockPopulate,
        select: mockSelect,
        lean: mockLean,
      }))

      // Act & Assert
      await expect(
        ProductController.getProduct(req as Request, res as Response)
      ).rejects.toEqual(
        expect.objectContaining({
          status: 404,
          message: 'Không tìm thấy sản phẩm',
        })
      )
    })
  })

  describe('updateProduct', () => {
    test('should update product successfully', async () => {
      // Arrange
      req.params = { product_id: 'product123' }
      req.body = {
        name: 'Updated Product',
        price: 150,
        priceBeforeDiscount: 200,
      }

      const mockProduct = {
        _id: 'product123',
        name: 'Updated Product',
        price: 150,
        price_before_discount: 200,
      }
      const mockFindByIdAndUpdate = jest.fn().mockReturnThis()
      const mockSelect = jest.fn().mockReturnThis()
      const mockPopulate = jest.fn().mockReturnThis()
      const mockPopulateShop = jest.fn().mockReturnThis()
      const mockLean = jest.fn().mockResolvedValue(mockProduct)

      ;(ProductModel.findByIdAndUpdate as jest.Mock).mockImplementation(() => ({
        select: mockSelect,
        populate: mockPopulate,
        lean: mockLean,
      }))

      // Act
      await ProductController.updateProduct(req as Request, res as Response)

      // Assert
      expect(ProductModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'product123',
        expect.objectContaining({
          name: 'Updated Product',
          price: 150,
          price_before_discount: 200,
        }),
        { new: true }
      )
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Cập nhật sản phẩm thành công',
        data: mockProduct,
      })
    })

    test('should handle product not found', async () => {
      // Arrange
      req.params = { product_id: 'nonexistent' }
      req.body = { name: 'Updated Product' }

      const mockFindByIdAndUpdate = jest.fn().mockReturnThis()
      const mockSelect = jest.fn().mockReturnThis()
      const mockPopulate = jest.fn().mockReturnThis()
      const mockLean = jest.fn().mockResolvedValue(null)

      ;(ProductModel.findByIdAndUpdate as jest.Mock).mockImplementation(() => ({
        select: mockSelect,
        populate: mockPopulate,
        lean: mockLean,
      }))

      // Act & Assert
      await expect(
        ProductController.updateProduct(req as Request, res as Response)
      ).rejects.toEqual(
        expect.objectContaining({
          status: 404,
          message: 'Không tìm thấy sản phẩm',
        })
      )
    })
  })

  describe('deleteProduct', () => {
    test('should delete a product and its images', async () => {
      // Arrange
      req.params = { product_id: 'product123' }

      const mockProduct = {
        _id: 'product123',
        name: 'Test Product',
        image: 'image.jpg',
        images: ['image1.jpg', 'image2.jpg'],
      }
      ;(ProductModel.findByIdAndDelete as jest.Mock).mockResolvedValue(
        mockProduct
      )

      // Act
      await ProductController.deleteProduct(req as Request, res as Response)

      // Assert
      expect(ProductModel.findByIdAndDelete).toHaveBeenCalledWith('product123')
      expect(fs.unlink).toHaveBeenCalledTimes(3) // Once for main image, twice for additional images
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Xóa thành công',
      })
    })

    test('should handle product not found', async () => {
      // Arrange
      req.params = { product_id: 'nonexistent' }
      ;(ProductModel.findByIdAndDelete as jest.Mock).mockResolvedValue(null)

      // Act & Assert
      await expect(
        ProductController.deleteProduct(req as Request, res as Response)
      ).rejects.toEqual(
        expect.objectContaining({
          status: 404,
          message: 'Không tìm thấy sản phẩm',
        })
      )
    })

    test('should handle cloudinary URLs correctly', async () => {
      // Arrange
      req.params = { product_id: 'product123' }

      const mockProduct = {
        _id: 'product123',
        name: 'Test Product',
        image:
          'https://res.cloudinary.com/demo/image/upload/shopee-clone/product/image123.jpg',
        images: [],
      }
      ;(ProductModel.findByIdAndDelete as jest.Mock).mockResolvedValue(
        mockProduct
      )

      // Act
      await ProductController.deleteProduct(req as Request, res as Response)

      // Assert
      expect(ProductModel.findByIdAndDelete).toHaveBeenCalledWith('product123')
      expect(cloudinary.v2.uploader.destroy).toHaveBeenCalledWith(
        'shopee-clone/product/image123',
        expect.any(Function)
      )
    })
  })

  describe('uploadProductImage', () => {
    test('should upload a single product image', async () => {
      // Arrange
      req.file = {
        buffer: Buffer.from('test image data'),
        mimetype: 'image/jpeg',
        originalname: 'test.jpg',
      } as Express.Multer.File

      // Mock cloudinary upload result
      const mockCloudinaryResult = {
        public_id: 'shopee-clone/product/test123',
        secure_url:
          'https://res.cloudinary.com/demo/image/upload/shopee-clone/product/test123.jpg',
      }

      // Mock the cloudinary upload_stream
      const mockUploadStream = jest.fn()
      ;(cloudinary.v2.uploader.upload_stream as jest.Mock).mockImplementation(
        (options, callback) => {
          callback(null, mockCloudinaryResult)
          return mockUploadStream
        }
      )

      // Act
      await ProductController.uploadProductImage(
        req as Request,
        res as Response
      )

      // Assert
      expect(cloudinary.v2.uploader.upload_stream).toHaveBeenCalled()
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Upload ảnh thành công',
        data: mockCloudinaryResult.secure_url,
      })
    })

    test('should handle missing file error', async () => {
      // Arrange
      req.file = null

      // Act & Assert
      await expect(
        ProductController.uploadProductImage(req as Request, res as Response)
      ).rejects.toEqual(
        expect.objectContaining({
          status: 400,
          message: 'Không tìm thấy file ảnh',
        })
      )
    })
  })

  describe('uploadManyProductImages', () => {
    test('should upload multiple product images', async () => {
      // Arrange
      req.files = [
        {
          buffer: Buffer.from('image 1 data'),
          mimetype: 'image/jpeg',
          originalname: 'test1.jpg',
        },
        {
          buffer: Buffer.from('image 2 data'),
          mimetype: 'image/png',
          originalname: 'test2.png',
        },
      ] as Express.Multer.File[]

      // Mock cloudinary upload results
      const mockCloudinaryResults = [
        {
          public_id: 'shopee-clone/product/test1',
          secure_url:
            'https://res.cloudinary.com/demo/image/upload/shopee-clone/product/test1.jpg',
        },
        {
          public_id: 'shopee-clone/product/test2',
          secure_url:
            'https://res.cloudinary.com/demo/image/upload/shopee-clone/product/test2.png',
        },
      ]

      // Mock the cloudinary upload_stream for multiple files
      const mockUploadStream = jest.fn()
      let callCount = 0
      ;(cloudinary.v2.uploader.upload_stream as jest.Mock).mockImplementation(
        (options, callback) => {
          callback(null, mockCloudinaryResults[callCount++])
          return mockUploadStream
        }
      )

      // Act
      await ProductController.uploadManyProductImages(
        req as Request,
        res as Response
      )

      // Assert
      expect(cloudinary.v2.uploader.upload_stream).toHaveBeenCalledTimes(2)
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Upload các ảnh thành công',
        data: [
          'https://res.cloudinary.com/demo/image/upload/shopee-clone/product/test1.jpg',
          'https://res.cloudinary.com/demo/image/upload/shopee-clone/product/test2.png',
        ],
      })
    })

    test('should handle missing files error', async () => {
      // Arrange
      req.files = null

      // Act & Assert
      await expect(
        ProductController.uploadManyProductImages(
          req as Request,
          res as Response
        )
      ).rejects.toEqual(
        expect.objectContaining({
          status: 400,
          message: 'Không tìm thấy file ảnh',
        })
      )
    })
  })

  describe('getRecentlyViewedProducts', () => {
    test('should get recently viewed products', async () => {
      // Arrange
      req.query = { userId: 'user123' }

      // Mock user with watchList
      const mockUser = {
        _id: 'user123',
        watchList: ['product1', 'product2', 'product3'],
      }
      ;(UserModel.findById as jest.Mock).mockResolvedValue(mockUser)

      // Mock product list
      const mockProducts = [
        { _id: 'product1', name: 'Product 1' },
        { _id: 'product2', name: 'Product 2' },
        { _id: 'product3', name: 'Product 3' },
      ]

      const mockFind = jest.fn().mockReturnThis()
      const mockPopulate = jest.fn().mockReturnThis()
      const mockSelect = jest.fn().mockReturnThis()
      const mockLean = jest.fn().mockResolvedValue(mockProducts)

      ;(ProductModel.find as jest.Mock).mockImplementation(() => ({
        populate: mockPopulate,
        select: mockSelect,
        lean: mockLean,
      }))

      // Act
      await ProductController.getRecentlyViewedProducts(
        req as Request,
        res as Response
      )

      // Assert
      expect(UserModel.findById).toHaveBeenCalledWith('user123')
      expect(ProductModel.find).toHaveBeenCalledWith({
        _id: { $in: ['product3', 'product2', 'product1'] }, // Reversed order
      })
      expect(mockPopulate).toHaveBeenCalledWith('category')
      expect(mockPopulate).toHaveBeenCalledWith('shop')
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Lấy các sản phẩm đã xem gần đây thành công',
        data: expect.any(Array),
      })
    })

    test('should handle user without watchList', async () => {
      // Arrange
      req.query = { userId: 'user123' }

      // Mock user without watchList
      const mockUser = {
        _id: 'user123',
        watchList: [],
      }
      ;(UserModel.findById as jest.Mock).mockResolvedValue(mockUser)

      // Act
      await ProductController.getRecentlyViewedProducts(
        req as Request,
        res as Response
      )

      // Assert
      expect(UserModel.findById).toHaveBeenCalledWith('user123')
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Người dùng chưa xem sản phẩm nào',
        data: [],
      })
    })

    test('should handle missing userId', async () => {
      // Arrange
      req.query = {}

      // Act & Assert
      await expect(
        ProductController.getRecentlyViewedProducts(
          req as Request,
          res as Response
        )
      ).rejects.toEqual(
        expect.objectContaining({
          status: 400,
          message: 'Thiếu userId',
        })
      )
    })

    test('should handle user not found', async () => {
      // Arrange
      req.query = { userId: 'nonexistent' }
      ;(UserModel.findById as jest.Mock).mockResolvedValue(null)

      // Act & Assert
      await expect(
        ProductController.getRecentlyViewedProducts(
          req as Request,
          res as Response
        )
      ).rejects.toEqual(
        expect.objectContaining({
          status: 404,
          message: 'Không tìm thấy người dùng',
        })
      )
    })
  })

  describe('getSearchHistory', () => {
    test('should get user search history', async () => {
      // Arrange
      req.params = { user_id: 'user123' }

      // Mock mongoose.Types.ObjectId.isValid
      mongoose.Types.ObjectId.isValid = jest.fn().mockReturnValue(true)

      // Mock search history
      const mockSearchHistory = [
        {
          _id: 'search1',
          user: 'user123',
          search: 'phone',
          createdAt: new Date(),
        },
        {
          _id: 'search2',
          user: 'user123',
          search: 'laptop',
          createdAt: new Date(),
        },
      ]

      const mockFind = jest.fn().mockReturnThis()
      const mockPopulate = jest.fn().mockReturnThis()
      const mockSort = jest.fn().mockReturnThis()
      const mockLean = jest.fn().mockResolvedValue(mockSearchHistory)

      ;(SearchHistoryModel.find as jest.Mock).mockImplementation(() => ({
        populate: mockPopulate,
        sort: mockSort,
        lean: mockLean,
      }))

      // Act
      await ProductController.getSearchHistory(req as Request, res as Response)

      // Assert
      expect(mongoose.Types.ObjectId.isValid).toHaveBeenCalledWith('user123')
      expect(SearchHistoryModel.find).toHaveBeenCalledWith({ user: 'user123' })
      expect(mockPopulate).toHaveBeenCalledWith('user', 'name email avatar')
      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 })
      expect(responseSuccess).toHaveBeenCalledWith(res, {
        message: 'Lấy lịch sử tìm kiếm thành công',
        data: mockSearchHistory,
      })
    })

    test('should handle invalid user ID', async () => {
      // Arrange
      req.params = { user_id: 'invalid-id' }

      // Mock mongoose.Types.ObjectId.isValid
      mongoose.Types.ObjectId.isValid = jest.fn().mockReturnValue(false)

      // Act & Assert
      await expect(
        ProductController.getSearchHistory(req as Request, res as Response)
      ).rejects.toEqual(
        expect.objectContaining({
          status: 400,
          message: 'ID người dùng không hợp lệ',
        })
      )
    })
  })
})
