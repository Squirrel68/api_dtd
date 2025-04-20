import recurly from 'recurly'
import { config } from '../constants/config'
import { IOrder } from '../database/models/order.model'
import { IUser } from '../database/models/user.model'

// Khởi tạo Recurly client
const client = new recurly.Client(config.RECURLY_API_KEY, {
  region: 'eu',
})

export class RecurlyService {
  /**
   * Lấy thông tin thanh toán đã lưu của người dùng
   */
  async getAccountBillingInfo(accountId: string) {
    try {
      const billingInfoList = await client.listBillingInfos(accountId)
      console.log('billingInfoList: ', billingInfoList)
      const result = []
      for await (const billingInfo of billingInfoList.each()) {
        // Chỉ lấy những thông tin cần thiết cho frontend
        result.push({
          id: billingInfo.id,
          card_type: billingInfo.paymentMethod?.cardType,
          last_four: billingInfo.paymentMethod?.lastFour,
          exp_month: billingInfo.paymentMethod?.expMonth,
          exp_year: billingInfo.paymentMethod?.expYear,
          updated_at: billingInfo.updatedAt,
        })
      }

      return {
        success: true,
        data: result,
      }
    } catch (error) {
      console.error('Recurly getAccountBillingInfo error:', error)

      // Nếu là lỗi not_found, trả về mảng rỗng
      if (error.type === 'not_found') {
        return {
          success: true,
          data: [],
        }
      }

      return {
        success: false,
        error: error.message,
      }
    }
  }

  /**
   * Thực hiện thanh toán một lần
   */
  async processPayment(order: IOrder, user: IUser, tokenId?: string) {
    try {
      // Xác định account_code cho Recurly
      const accountCode = user.recurly_account_id || user._id.toString()

      // Chuẩn bị dữ liệu cho createPurchase
      const purchaseData: any = {
        currency: 'VND',
        account: {
          code: accountCode,
          email: user.email,
          firstName: user.name?.split(' ')[0] || 'Customer',
          lastName: user.name?.split(' ').slice(1).join(' ') || ' ',
        },
        lineItems: [
          {
            currency: 'VND',
            unit_amount: order.total_amount + order.shipping_fee,
            description: `Đơn hàng #${order._id.toString()}`,
            quantity: 1,
            type: 'charge',
            productCode: `order-${order._id.toString()}`,
          },
        ],
        collectionMethod: 'automatic',
      }

      // Thêm thông tin thẻ mới nếu có
      if (tokenId) {
        purchaseData.account.billingInfo = {
          tokenId: tokenId,
        }
      }

      // Gọi API Recurly để tạo giao dịch
      const purchase = await client.createPurchase(purchaseData)

      // Xử lý kết quả trả về
      let transactionId = null
      let accountId = null

      // Lấy thông tin transaction và account từ response
      if (
        purchase.chargeInvoice &&
        purchase.chargeInvoice.transactions &&
        purchase.chargeInvoice.transactions.length > 0
      ) {
        const transaction = purchase.chargeInvoice.transactions[0]
        transactionId = transaction.id
      }

      if (purchase.chargeInvoice.account) {
        accountId = purchase.chargeInvoice.account.id
      }

      return {
        success: true,
        transaction_id: transactionId,
        account_id: accountId,
        response: purchase,
      }
    } catch (error) {
      console.error('Recurly processPayment error:', error)
      return {
        success: false,
        error: error.message,
        error_code: error.type,
        details: error,
      }
    }
  }
}

export const recurlyService = new RecurlyService()
