import { apiRequest } from './client'

export async function uploadProductImage(file) {
  if (!file) {
    throw new Error('Please choose an image file first.')
  }

  const signData = await apiRequest('/cloudinary/sign', {
    method: 'POST',
    body: JSON.stringify({
      folder: 'eshop/products',
    }),
  })

  const formData = new FormData()
  formData.append('file', file)
  formData.append('api_key', signData.api_key)
  formData.append('timestamp', String(signData.timestamp))
  formData.append('signature', signData.signature)
  formData.append('folder', 'eshop/products')

  const uploadResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${signData.cloud_name}/image/upload`,
    {
      method: 'POST',
      body: formData,
    },
  )

  const uploadJson = await uploadResponse.json()

  if (!uploadResponse.ok || !uploadJson.secure_url) {
    throw new Error(uploadJson.error?.message || 'Image upload failed.')
  }

  return uploadJson.secure_url
}