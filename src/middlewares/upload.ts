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

// 2. Configuramos o "armazém" para enviar diretamente para a nuvem
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'presensee_biometria', 
    allowed_formats: ['jpg', 'jpeg', 'png'], // Só aceitamos imagens
  } as any,
});

export const upload = multer({ storage });