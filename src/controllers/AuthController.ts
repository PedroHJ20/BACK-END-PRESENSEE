import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'chave-secreta-super-segura-presensee';

export class AuthController {
  static async login(req: Request, res: Response) {
    const { email, password } = req.body;

    try {
      // 1. Verifica se o usuário existe
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }

      // 2. Compara a senha digitada com a senha criptografada no banco
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }

      // 3. Gera o Token de Acesso (Crachá digital)
      const token = jwt.sign(
        { id: user.id, role: user.role, name: user.name },
        JWT_SECRET,
        { expiresIn: '8h' } // Token expira no final do expediente
      );

      // 4. Devolve o token e os dados básicos para o Front-end montar a tela
      return res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        token
      });

    } catch (error) {
      return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
  }

  static async setup(req: Request, res: Response) {
    const { name, email, password, role } = req.body;

    try {
      // O número 10 é o "salt rounds", determinando o nível de complexidade da criptografia
      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: role || 'ADMIN'
        }
      });

      return res.status(201).json({ message: 'Administrador criado!', userId: user.id });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao criar administrador.' });
    }
  }
}