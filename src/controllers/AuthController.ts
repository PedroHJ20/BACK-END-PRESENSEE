import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET as string;

export class AuthController {
  // Rota de Login Oficial
  static async login(req: Request, res: Response) {
    const { email, password } = req.body;

    try {
      // 1. Busca o utilizador (Ajuste prisma.user para prisma.admin se sua tabela tiver outro nome)
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return res.status(401).json({ error: 'Email ou senha inválidos.' });
      }

      // 2. Verifica a senha criptografada
      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        return res.status(401).json({ error: 'Email ou senha inválidos.' });
      }

      // 3. Gera o Token JWT
      const token = jwt.sign(
        { id: user.id, name: user.name, role: user.role },
        JWT_SECRET,
        { expiresIn: '1d' }
      );

      return res.json({
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        token
      });
    } catch (error) {
      console.error('Erro no login:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body
      });
      return res.status(500).json({ error: 'Erro interno ao realizar login.' + (error instanceof Error ? error.message : String(error)) });
    }
  }

  // Rota Temporária de Setup (Para criar o 1º administrador)
  static async setup(req: Request, res: Response) {
    const { name, email, password, role } = req.body;

    try {
      const userExists = await prisma.user.findUnique({ where: { email } });

      if (userExists) {
        return res.status(400).json({ error: 'Usuário já existe no banco de dados.' });
      }

      // Criptografa a senha antes de salvar
      const hashedPassword = await bcrypt.hash(password, 10);

      // Salva no banco de dados
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: role || 'ADMIN'
        }
      });

      return res.status(201).json({ message: 'Administrador criado com sucesso!', user: { id: user.id, email: user.email } });
    } catch (error) {
      console.error('Erro no setup de administrador:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body
      });
      return res.status(500).json({ error: 'Erro ao criar administrador.' });
    }
  }
}