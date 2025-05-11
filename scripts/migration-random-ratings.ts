import mongoose from 'mongoose'
import { ProductModel } from '../database/models/product.model'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const MONGODB_URI = process.env.DB_URL || 'mongodb://localhost:27017/api_dtd'

/**
 * Migration script to update product ratings with random values between 1 and 5
 */
async function randomizeProductRatings() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB')

    // Find all products
    const products = await ProductModel.find({})

    console.log(`Found ${products.length} products for rating update`)

    // Update each product with random rating
    let updatedCount = 0
    for (const product of products) {
      // Generate random rating between 1 and 5 with one decimal place
      const randomRating = Math.round((Math.random() * 4 + 1) * 10) / 10 // 1.0 to 5.0

      // Update the product
      await ProductModel.updateOne(
        { _id: product._id },
        { rating: randomRating }
      )

      updatedCount++
      console.log(
        `Updated product ${product._id} - Name: ${product.name} - Old Rating: ${product.rating} -> New Rating: ${randomRating}`
      )
    }

    console.log(`Successfully updated ratings for ${updatedCount} products`)
  } catch (error) {
    console.error('Error during migration:', error)
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close()
    console.log('MongoDB connection closed')
  }
}

// Run the migration
randomizeProductRatings()
  .then(() => {
    console.log('Rating migration completed')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Rating migration failed:', err)
    process.exit(1)
  })
