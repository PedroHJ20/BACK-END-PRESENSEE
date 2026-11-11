import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET as string;

export class AuthController {
  
  static async login(req: Request, res: Response) {
    const { email, password } = req.body;

    try {
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return res.status(401).json({ error: 'Email ou senha inválidos.' });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        return res.status(401).json({ error: 'Email ou senha inválidos.' });
      }

      // TRAVA DE SEGURANÇA: Se for o primeiro acesso, não retorna o token definitivo
      if (user.primeiroAcesso) {
        return res.status(403).json({ 
          requirePasswordChange: true, 
          userId: user.id,
          message: "Atenção: É obrigatório alterar a sua senha provisória no primeiro acesso."
        });
      }

      const token = jwt.sign(
        { id: user.id, name: user.name, role: user.role, escolaId: user.escolaId },
        JWT_SECRET,
        { expiresIn: '1d' }
      );

      return res.json({
        user: { 
          id: user.id, 
          name: user.name, 
          email: user.email, 
          role: user.role,
          telefone: user.telefone, 
          avatar: user.avatar,
          escolaId: user.escolaId
        },
        token
      });
    } catch (error) {
      console.error('Erro no login:', error);
      return res.status(500).json({ error: 'Erro interno ao realizar login.' });
    }
  }

  // ROTA NOVA: Para o gestor cadastrar a senha definitiva no primeiro acesso
  static async changeInitialPassword(req: Request, res: Response) {
    const { userId, newPassword } = req.body;

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      if (!user.primeiroAcesso) {
        return res.status(400).json({ error: 'Este usuário já realizou o primeiro acesso.' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { 
          password: hashedPassword,
          primeiroAcesso: false // Libera o acesso definitivo
        }
      });

      return res.json({ message: "Senha alterada com sucesso! Você já pode fazer login." });
    } catch (error) {
      console.error('Erro ao alterar senha inicial:', error);
      return res.status(500).json({ error: 'Erro ao alterar a senha.' });
    }
  }

  static async setup(req: Request, res: Response) {
    const { name, email, password, role } = req.body;

    try {
      const userExists = await prisma.user.findUnique({ where: { email } });

      if (userExists) {
        return res.status(400).json({ error: 'Usuário já existe no banco de dados.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: role || 'ADMIN',
          primeiroAcesso: false // O Admin configurado manualmente não precisa passar pelo fluxo
        }
      });

      return res.status(201).json({ message: 'Administrador criado com sucesso!', user: { id: user.id, email: user.email } });
    } catch (error) {
      console.error('Erro no setup de administrador:', error);
      return res.status(500).json({ error: 'Erro ao criar administrador.' });
    }
  }
}