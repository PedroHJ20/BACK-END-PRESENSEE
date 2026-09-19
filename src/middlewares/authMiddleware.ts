import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'chave-secreta-super-segura-presensee';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token não fornecido. Acesso negado.' });
  }

  // O React envia no formato: "Bearer eyJhbGciOiJIUzI1Ni..."
  const [, token] = authHeader.split(' ');

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Libera a catraca para a rota continuar funcionando
    return next(); 
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}