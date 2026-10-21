import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import path from 'path';
import { prisma } from './lib/prisma.js';

const app = express();

app.use(cors());
app.use(express.json());

// TORNA A PASTA UPLOADS ACESSÍVEL PUBLICAMENTE VIA URL
app.use('/uploads', express.static(path.resolve('uploads')));

app.use(routes);

const PORT = process.env.PORT || 3333;

async function startServer() {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Conexão com o banco de dados estabelecida.');

    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando localmente na porta ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Falha ao conectar com o banco de dados. Servidor não iniciado.');
    console.error(error);
    process.exitCode = 1;
  }
}

void startServer();