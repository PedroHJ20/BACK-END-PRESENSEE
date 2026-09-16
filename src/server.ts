import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import path from 'path';

const app = express();

app.use(cors());
app.use(express.json());

// TORNA A PASTA UPLOADS ACESSÍVEL PUBLICAMENTE VIA URL
app.use('/uploads', express.static(path.resolve('uploads')));

app.use(routes);

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando localmente na porta ${PORT}`);
});