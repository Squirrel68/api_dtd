// jest.setup.ts
import { MongoMemoryServer } from 'mongodb-memory-server'

export default async function globalSetup() {
  const instance = await MongoMemoryServer.create()
  const uri = instance.getUri()
  ;(global as any).__MONGOD__ = instance
  process.env.MONGO_URI = uri.slice(0, uri.lastIndexOf('/'))
}

export async function globalTeardown() {
  const instance: MongoMemoryServer = (global as any).__MONGOD__
  await instance.stop()
}
