import mongoose from 'mongoose'
import { ProductModel } from '../database/models/product.model'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const MONGODB_URI = process.env.DB_URL || 'mongodb://localhost:27017/api_dtd'

async function updatePriceBeforeDiscount() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB')

    // Find products where price_before_discount is 0 or not set
    const products = await ProductModel.find({
      $or: [
        { price_before_discount: 0 },
        { price_before_discount: { $exists: false } },
      ],
    })

    console.log(
      `Found ${products.length} products that need price_before_discount update`
    )

    // Update each product
    let updatedCount = 0
    for (const product of products) {
      // Generate random percentage between 10% and 30%
      const randomPercentage = Math.random() * 0.2 + 0.1 // 10% to 30%

      // Calculate new price_before_discount
      const newPriceBeforeDiscount =
        product.price + product.price * randomPercentage

      // Update the product
      await ProductModel.updateOne(
        { _id: product._id },
        {
          price_before_discount: Math.round(newPriceBeforeDiscount * 100) / 100,
        } // Round to 2 decimal places
      )

      updatedCount++
      console.log(`Updated product ${product._id} - Name: ${product.name}`)
      console.log(
        `  Original price: ${product.price}, New price_before_discount: ${
          Math.round(newPriceBeforeDiscount * 100) / 100
        }`
      )
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
updatePriceBeforeDiscount()
  .then(() => {
    console.log('Migration completed')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
