import { Request, Response } from 'express'
import { responseSuccess, ErrorHandler } from '../utils/response'
import { ProductModel } from '../database/models/product.model'
import { STATUS } from '../constants/status'
import mongoose from 'mongoose'
import { isAdmin } from '../utils/validate'
import { uploadFile, uploadManyFile } from '../utils/upload'
import { HOST } from '../utils/helper'
import { FOLDERS, FOLDER_UPLOAD, ROUTE_IMAGE } from '../constants/config'
import fs from 'fs'
import { omitBy } from 'lodash'
import { ORDER, SORT_BY } from '../constants/product'
import cloudinary from 'cloudinary'
import streamifier from 'streamifier'
import { SearchHistoryModel } from '../database/models/search.model'
import { UserModel } from '../database/models/user.model'

// Cấu hình Cloudinary
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Function để upload từ buffer lên Cloudinary
const uploadToCloudinary = (buffer: Buffer, folder: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.v2.uploader.upload_stream(
      {
        folder: `shopee-clone/${folder}`,
      },
      (error, result) => {
        if (error) return reject(error)
        resolve(result)
      }
    )

    streamifier.createReadStream(buffer).pipe(uploadStream)
  })
}

// Cập nhật handleImageProduct để không cần xử lý URL (vì Cloudinary đã trả về URL đầy đủ)
export const handleImageProduct = (product) => {
  // Nếu đường dẫn đã là URL đầy đủ (bắt đầu bằng http hoặc https), không cần xử lý
  if (product.image && !product.image.startsWith('http')) {
    product.image = HOST + `/${ROUTE_IMAGE}/` + product.image
  }

  if (product.images && product.images.length !== 0) {
    product.images = product.images.map((image) => {
      if (image && !image.startsWith('http')) {
        return image !== '' ? HOST + `/${ROUTE_IMAGE}/` + image : ''
      }
      return image
    })
  }
  return product
}

const removeImageProduct = (image) => {
  if (!image) return

  // Kiểm tra xem image có phải URL web không
  if (image.startsWith('http')) {
    // Nếu là URL Cloudinary, lấy public_id để xóa
    if (image.includes('cloudinary.com')) {
      try {
        // Trích xuất public_id từ URL Cloudinary
        const urlParts = image.split('/')
        const fileNameWithExtension = urlParts[urlParts.length - 1]
        const publicId = `shopee-clone/${FOLDERS.PRODUCT}/${
          fileNameWithExtension.split('.')[0]
        }`

        // Xóa ảnh trên Cloudinary (bất đồng bộ)
        cloudinary.v2.uploader.destroy(publicId, (error) => {
          if (error)
            console.error('Error deleting image from Cloudinary:', error)
        })
      } catch (error) {
        console.error('Error parsing Cloudinary URL:', error)
      }
    }
    // Nếu là URL web khác, không làm gì cả
    return
  }
  // Nếu là file local, xóa như cũ
  if (image !== undefined && image !== '') {
    try {
      fs.unlink(`${FOLDER_UPLOAD}/${FOLDERS.PRODUCT}/${image}`, (err) => {
        if (err) console.error('Error deleting local file:', err)
      })
    } catch (error) {
      console.error('Error in removeImageProduct:', error)
    }
  }
}

// Cập nhật hàm removeManyImageProduct với xử lý lỗi tốt hơn
const removeManyImageProduct = (images: string[]) => {
  if (!images || !Array.isArray(images)) return

  images.forEach((image) => {
    try {
      removeImageProduct(image)
    } catch (error) {
      console.error('Error in removeManyImageProduct:', error)
    }
  })
}

const addProduct = async (req: Request, res: Response) => {
  const form: Product = req.body
  const {
    name,
    description,
    category,
    image,
    images,
    price,
    rating,
    price_before_discount,
    quantity,
    sold,
    view,
  } = form
  // get user id from jwt token
  const userId = req.jwtDecoded.id
  const product = {
    name,
    description,
    category,
    image,
    images,
    price,
    rating,
    price_before_discount,
    quantity,
    sold,
    view,
    shop: userId,
  }
  const productAdd = await new ProductModel(product).save()
  const response = {
    message: 'Tạo sản phẩm thành công',
    data: productAdd.toObject({
      transform: (doc, ret, option) => {
        delete ret.__v
        return handleImageProduct(ret)
      },
    }),
  }
  return responseSuccess(res, response)
}

const getProducts = async (req: Request, res: Response) => {
  let {
    page = 1,
    limit = 30,
    category,
    exclude,
    sort_by,
    order,
    rating_filter,
    price_max,
    price_min,
    name,
    userId,
  } = req.query as {
    [key: string]: string | number
  }
  // Lưu lịch sử tìm kiếm nếu người dùng đã đăng nhập và có tìm kiếm theo tên
  try {
    if (name && userId) {
      // Lưu lịch sử tìm kiếm không chặn luồng chính
      console.log('Saving search history...')
      SearchHistoryModel.create({
        user: userId,
        search: name.toString(),
      }).catch((err) => {
        console.error('Error saving search history:', err)
      })
    }
  } catch (error) {
    // Xử lý lỗi nhưng không dừng API - chỉ log lỗi
    console.error('Error handling search history:', error)
  }

  page = Number(page)
  limit = Number(limit)
  let condition: any = {}
  if (category) {
    condition.category = category
  }
  if (exclude) {
    condition._id = { $ne: exclude }
  }
  if (rating_filter) {
    condition.rating = { $gte: rating_filter }
  }
  if (price_max) {
    condition.price = {
      $lte: price_max,
    }
  }
  if (price_min) {
    condition.price = condition.price
      ? { ...condition.price, $gte: price_min }
      : { $gte: price_min }
  }
  if (!ORDER.includes(order as string)) {
    order = ORDER[0]
  }
  if (!SORT_BY.includes(sort_by as string)) {
    sort_by = SORT_BY[0]
  }
  if (name) {
    condition.name = {
      $regex: name,
      $options: 'i',
    }
  }
  let [products, totalProducts]: [products: any, totalProducts: any] =
    await Promise.all([
      ProductModel.find(condition)
        .populate({
          path: 'category',
        })
        .populate({
          path: 'shop',
        })
        .sort({ [sort_by]: order === 'desc' ? -1 : 1 })
        .skip(page * limit - limit)
        .limit(limit)
        .select({ __v: 0, description: 0 })
        .lean(),
      ProductModel.find(condition).countDocuments().lean(),
    ])
  products = products.map((product) => handleImageProduct(product))
  const page_size = Math.ceil(totalProducts / limit) || 1
  const response = {
    message: 'Lấy các sản phẩm thành công',
    data: {
      products,
      pagination: {
        page,
        limit,
        page_size,
      },
    },
  }
  return responseSuccess(res, response)
}

const getAllProducts = async (req: Request, res: Response) => {
  let { category } = req.query
  let condition = {}
  if (category) {
    condition = { category: category }
  }
  let products: any = await ProductModel.find(condition)
    .populate({ path: 'category' })
    .sort({ createdAt: -1 })
    .select({ __v: 0, description: 0 })
    .lean()
  products = products.map((product) => handleImageProduct(product))
  const response = {
    message: 'Lấy tất cả sản phẩm thành công',
    data: products,
  }
  return responseSuccess(res, response)
}
const getMyProducts = async (req: Request, res: Response) => {
  // get user id from jwt token
  const userId = req.jwtDecoded.id
  const condition = { shop: userId }
  let products: any = await ProductModel.find(condition)
    .populate({ path: 'category' })
    .sort({ createdAt: -1 })
    .select({ __v: 0, description: 0 })
    .lean()
  products = products.map((product) => handleImageProduct(product))
  const response = {
    message: 'Lấy tất cả sản phẩm thành công',
    data: products,
  }
  return responseSuccess(res, response)
}

const getProduct = async (req: Request, res: Response) => {
  let condition = { _id: req.params.product_id }
  const { userId } = req.query
  if (userId) {
    try {
      // Tìm user
      const user = await UserModel.findById(userId)

      if (user) {
        const productId = req.params.product_id
        const watchList = user.watchList || []

        // Kiểm tra xem sản phẩm đã có trong watchList chưa
        const existingIndex = watchList.findIndex(
          (id) => id.toString() === productId
        )

        // Nếu sản phẩm đã tồn tại trong watchList, xóa nó
        if (existingIndex !== -1) {
          watchList.splice(existingIndex, 1)
        }

        // Thêm sản phẩm vào cuối mảng
        watchList.push(new mongoose.Schema.Types.ObjectId(productId))

        // Giới hạn kích thước watchList nếu cần (giả sử tối đa 20 sản phẩm)
        while (watchList.length > 20) {
          watchList.shift() // Xóa sản phẩm cũ nhất
        }

        // Cập nhật watchList cho user
        await UserModel.findByIdAndUpdate(userId, { watchList })

        console.log(
          `Đã cập nhật watchList cho user ${userId} với sản phẩm ${productId}`
        )
      }
    } catch (error) {
      console.error('Lỗi khi cập nhật watchList:', error)
      // Không throw error để đảm bảo API vẫn tiếp tục hoạt động
    }
  }
  const productDB: any = await ProductModel.findOneAndUpdate(
    condition,
    { $inc: { view: 1 } },
    { new: true }
  )
    .populate('category')
    .populate('shop')
    .select({ __v: 0 })
    .lean()
  if (productDB) {
    const response = {
      message: 'Lấy sản phẩm thành công',
      data: handleImageProduct(productDB),
    }
    return responseSuccess(res, response)
  } else {
    throw new ErrorHandler(STATUS.NOT_FOUND, 'Không tìm thấy sản phẩm')
  }
}

const updateProduct = async (req: Request, res: Response) => {
  const form: Product = req.body
  const {
    name,
    description,
    category,
    image,
    rating,
    price,
    images,
    price_before_discount,
    quantity,
    sold,
    view,
  } = form
  const product = omitBy(
    {
      name,
      description,
      category,
      image,
      rating,
      price,
      images,
      price_before_discount,
      quantity,
      sold,
      view,
    },
    (value) => value === undefined || value === ''
  )
  const productDB = await ProductModel.findByIdAndUpdate(
    req.params.product_id,
    product,
    {
      new: true,
    }
  )
    .select({ __v: 0 })
    .lean()
  if (productDB) {
    const response = {
      message: 'Cập nhật sản phẩm thành công',
      data: handleImageProduct(productDB),
    }
    return responseSuccess(res, response)
  } else {
    throw new ErrorHandler(STATUS.NOT_FOUND, 'Không tìm thấy sản phẩm')
  }
}

const deleteProduct = async (req: Request, res: Response) => {
  const product_id = req.params.product_id
  const productDB: any = await ProductModel.findByIdAndDelete(product_id).lean()
  if (productDB) {
    removeImageProduct(productDB.image)
    removeManyImageProduct(productDB.images)
    return responseSuccess(res, { message: 'Xóa thành công' })
  } else {
    throw new ErrorHandler(STATUS.NOT_FOUND, 'Không tìm thấy sản phẩm')
  }
}

const deleteManyProducts = async (req: Request, res: Response) => {
  const list_id = (req.body.list_id as string[]).map((id: string) =>
    mongoose.Types.ObjectId(id)
  )
  const productDB: any = await ProductModel.find({
    _id: { $in: list_id },
  }).lean()
  const deletedData = await ProductModel.deleteMany({
    _id: { $in: list_id },
  }).lean()
  productDB.forEach((product) => {
    removeImageProduct(product.image)
    removeManyImageProduct(product.images)
  })
  if (productDB.length > 0) {
    return responseSuccess(res, {
      message: `Xóa ${deletedData.deletedCount} sản phẩm thành công`,
      data: { deleted_count: deletedData.deletedCount },
    })
  } else {
    throw new ErrorHandler(STATUS.NOT_FOUND, 'Không tìm thấy sản phẩm')
  }
}

const searchProduct = async (req: Request, res: Response) => {
  let { searchText }: { [key: string]: string | any } = req.query
  searchText = decodeURI(searchText)
  let condition = { $text: { $search: `\"${searchText}\"` } }
  if (!isAdmin(req)) {
    condition = Object.assign(condition, { visible: true })
  }
  let products: any = await ProductModel.find(condition)
    .populate('category')
    .sort({ createdAt: -1 })
    .select({ __v: 0, description: 0 })
    .lean()
  products = products.map((product) => handleImageProduct(product))
  const response = {
    message: 'Tìm các sản phẩm thành công',
    data: products,
  }
  return responseSuccess(res, response)
}

const uploadProductImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      throw new ErrorHandler(STATUS.BAD_REQUEST, 'Không tìm thấy file ảnh')
    }

    // Upload ảnh lên Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, FOLDERS.PRODUCT)

    // Trả về secure URL từ Cloudinary
    const response = {
      message: 'Upload ảnh thành công',
      data: result.secure_url,
    }

    return responseSuccess(res, response)
  } catch (error) {
    console.error('Error uploading image to Cloudinary:', error)
    throw new ErrorHandler(STATUS.INTERNAL_SERVER_ERROR, 'Lỗi khi tải ảnh lên')
  }
}

const uploadManyProductImages = async (req: Request, res: Response) => {
  try {
    if (!req.files || !(req.files as Express.Multer.File[]).length) {
      throw new ErrorHandler(STATUS.BAD_REQUEST, 'Không tìm thấy file ảnh')
    }

    const files = req.files as Express.Multer.File[]

    // Upload tất cả ảnh lên Cloudinary
    const uploadPromises = files.map((file) =>
      uploadToCloudinary(file.buffer, FOLDERS.PRODUCT)
    )

    // Đợi tất cả upload hoàn thành
    const results = await Promise.all(uploadPromises)

    // Lấy các secure URL
    const secureUrls = results.map((result) => result.secure_url)

    const response = {
      message: 'Upload các ảnh thành công',
      data: secureUrls,
    }

    return responseSuccess(res, response)
  } catch (error) {
    console.error('Error uploading multiple images to Cloudinary:', error)
    throw new ErrorHandler(
      STATUS.INTERNAL_SERVER_ERROR,
      'Lỗi khi tải nhiều ảnh lên'
    )
  }
}

// Thêm hàm mới vào product.controller.ts
const getRecentlyViewedProducts = async (req: Request, res: Response) => {
  try {
    const { userId } = req.query

    // Validate userId
    if (!userId) {
      throw new ErrorHandler(STATUS.BAD_REQUEST, 'Thiếu userId')
    }

    // Tìm user và lấy watchList
    const user = await UserModel.findById(userId).select('watchList').lean()

    if (!user) {
      throw new ErrorHandler(STATUS.NOT_FOUND, 'Không tìm thấy người dùng')
    }

    // Nếu không có watchList hoặc watchList rỗng
    if (!user.watchList || user.watchList.length === 0) {
      return responseSuccess(res, {
        message: 'Người dùng chưa xem sản phẩm nào',
        data: [],
      })
    }

    // Lấy thông tin sản phẩm từ watchList
    // watchList đã được sắp xếp với sản phẩm mới xem nhất ở cuối mảng
    // nên chúng ta sẽ đảo ngược trước khi truy vấn
    const productIds = [...user.watchList].reverse()

    // Lấy tất cả sản phẩm theo IDs
    const products = await ProductModel.find({
      _id: { $in: productIds },
    })
      .populate('category')
      .select({ __v: 0 })
      .lean()

    // Sắp xếp sản phẩm theo thứ tự trong watchList (mới nhất đầu tiên)
    // Tạo map để tìm kiếm nhanh
    const productMap = {}
    products.forEach((product) => {
      productMap[product._id.toString()] = product
    })

    // Sắp xếp theo thứ tự của watchList (đã đảo ngược)
    const sortedProducts = productIds
      .map((id) => productMap[id.toString()])
      .filter(Boolean) // Lọc bỏ các sản phẩm không tồn tại
      .map((product) => handleImageProduct(product)) // Xử lý URL hình ảnh

    return responseSuccess(res, {
      message: 'Lấy các sản phẩm đã xem gần đây thành công',
      data: sortedProducts,
    })
  } catch (error) {
    console.error('Error getting recently viewed products:', error)
    throw error
  }
}

const ProductController = {
  addProduct,
  getAllProducts,
  getProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  searchProduct,
  deleteManyProducts,
  uploadProductImage,
  uploadManyProductImages,
  getMyProducts,
  getRecentlyViewedProducts,
}

export default ProductController
