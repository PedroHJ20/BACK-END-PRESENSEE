import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// 1. Forçamos o TypeScript a entender que a chave é uma string
const JWT_SECRET = (process.env.JWT_SECRET || 'chave-secreta-super-segura-presensee') as string;

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        role: string;
        escolaId: string | null;
      };
    }
  }
}

interface TokenPayload {
  id: string;
  name: string;
  role: string;
  escolaId: string | null;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token não fornecido. Acesso negado.' });
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2) {
    return res.status(401).json({ error: 'Formato de token inválido.' });
  }

  // 2. Forçamos o TypeScript a entender que a posição 1 do array existe e é uma string
  const token = parts[1] as string;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as TokenPayload;

    req.user = decoded;

    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}