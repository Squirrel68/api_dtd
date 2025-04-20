require('dotenv').config()
export const config = {
  SECRET_KEY: process.env.SECRET_KEY_JWT || 'shopee-clone',
  EXPIRE_ACCESS_TOKEN:
    Number(process.env.EXPIRE_ACCESS_TOKEN) || 60 * 60 * 24 * 7, // 7 days
  REFRESH_TOKEN_SECRET:
    process.env.REFRESH_TOKEN_SECRET || 'shopee-clone-refresh',
  EXPIRE_REFRESH_TOKEN:
    Number(process.env.EXPIRE_REFRESH_TOKEN) || 60 * 60 * 24 * 30, // 30 days

  // Recurly config
  RECURLY_API_KEY:
    process.env.RECURLY_API_KEY || '666d283c1e1447f48b2b482ea483e148',
  RECURLY_SUBDOMAIN:
    process.env.RECURLY_SUBDOMAIN || 'https://mobile-test.eu.recurly.com/',
}
// 60, "2 days", "10h", "7d". A numeric value is interpreted as a seconds count. If you use a string be sure you provide the time units (days, hours, etc), otherwise milliseconds unit is used by default ("120" is equal to "120ms").

export const FOLDER_UPLOAD = 'upload'

export const FOLDERS = {
  PRODUCT: 'product',
  AVATAR: 'avatar',
}

export const ROUTE_IMAGE = 'images'
