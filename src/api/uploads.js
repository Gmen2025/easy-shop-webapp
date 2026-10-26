import { apiRequest } from './client'
import { normalizeStoreLogo } from '../utils/storeLogo'

async function uploadImage(file, folder) {
  if (!file) {
    throw new Error('Please choose an image file first.')
  }

  const signData = await apiRequest('/cloudinary/sign', {
    method: 'POST',
    body: JSON.stringify({
      folder,
    }),
  })

  const formData = new FormData()
  formData.append('file', file)
  formData.append('api_key', signData.api_key)
  formData.append('timestamp', String(signData.timestamp))
  formData.append('signature', signData.signature)
  formData.append('folder', folder)

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

export function uploadProductImage(file) {
  return uploadImage(file, 'eshop/products')
}

export function uploadDriverPhoto(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG or WebP driver photo.')
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('Driver photos must be 5 MB or smaller.')
  return uploadImage(file, 'driver_profiles')
}

export async function uploadStoreLogo(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG or WebP logo image.')
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('Logo images must be 5 MB or smaller.')
  return normalizeStoreLogo(await uploadImage(file, 'eshop/stores'))
}

export async function uploadProductImages(files = []) {
  const validFiles = files.filter(Boolean)

  if (validFiles.length === 0) {
    throw new Error('Please choose at least one image file first.')
  }

  const uploadedImages = await Promise.all(validFiles.map((file) => uploadProductImage(file)))
  return uploadedImages
}