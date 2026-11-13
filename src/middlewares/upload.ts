import 'dotenv/config';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// 1. Apresentamos as nossas credenciais ao Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
  api_key: process.env.CLOUDINARY_API_KEY as string,
  api_secret: process.env.CLOUDINARY_API_SECRET as string,
});

// 2. Armazém para fotos de perfil e reconhecimento facial (inclui webp)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'presensee_biometria',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  } as any,
});

// 3. Armazém para atestados médicos (PDF, PNG, JPG)
const storageAtestados = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'presensee_atestados',
    resource_type: 'auto',
    allowed_formats: ['pdf', 'jpg', 'jpeg', 'png'],
  } as any,
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadAtestado = multer({
  storage: storageAtestados,
  limits: { fileSize: 5 * 1024 * 1024 },
});