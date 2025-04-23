import mongoose from 'mongoose'
import { ProductModel } from '../database/models/product.model'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const MONGODB_URI = process.env.DB_URL || 'mongodb://localhost:27017/api_dtd'

async function convertPricesToInt() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB')

    // Find all products
    const products = await ProductModel.find({})

    console.log(`Found ${products.length} products to process`)

    // Update each product
    let updatedCount = 0
    for (const product of products) {
      // Convert price and price_before_discount to integers
      const intPrice = Math.round(product.price)
      const intPriceBeforeDiscount = Math.round(product.price_before_discount)

      // Only update if values are different
      if (
        intPrice !== product.price ||
        intPriceBeforeDiscount !== product.price_before_discount
      ) {
        await ProductModel.updateOne(
          { _id: product._id },
          {
            price: intPrice,
            price_before_discount: intPriceBeforeDiscount,
          }
        )

        updatedCount++
        console.log(`Updated product ${product._id} - Name: ${product.name}`)
        console.log(
          `  Original price: ${product.price} → ${intPrice}, ` +
            `Original price_before_discount: ${product.price_before_discount} → ${intPriceBeforeDiscount}`
        )
      }
    }

    console.log(`Successfully updated ${updatedCount} products`)
  } catch (error) {
    console.error('Error during migration:', error)
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close()
    console.log('MongoDB connection closed')
  }
}

// Run the migration
convertPricesToInt()
  .then(() => {
    console.log('Migration completed')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
