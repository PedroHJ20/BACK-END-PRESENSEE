import type { Request, Response } from "express";
import { PrismaClient } from '@prisma/client';
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export class UserController {
  static async create(req: Request, res: Response) {
    try {
      const { name, email, password, role, escolaId } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: role || "MANAGER",
          escolaId
        }
      });
      
      const { password: _, ...userSemSenha } = user;
      return res.status(201).json(userSemSenha);
    } catch (error) {
      console.error("Erro ao criar usuário:", error);
      return res.status(500).json({ error: "Erro ao criar usuário." });
    }
  }

  static async index(req: Request, res: Response) {
    try {
      const users = await prisma.user.findMany({
        include: { escola: true }
      });
      
      const usersSemSenha = users.map((user: any) => {
        const { password, ...rest } = user;
        return rest;
      });
      
      return res.json(usersSemSenha);
    } catch (error) {
      console.error("Erro ao listar usuários:", error);
      return res.status(500).json({ error: "Erro ao listar usuários." });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { name, email, telefone } = req.body; 
      
      const user = await prisma.user.update({
        where: { id },
        data: {
          name,
          email,
          telefone
        }
      });
      
      const { password: _, ...userSemSenha } = user;
      return res.json(userSemSenha);
    } catch (error) {
      console.error("Erro ao atualizar usuário:", error);
      return res.status(500).json({ error: "Erro ao atualizar usuário." });
    }
  }

  // Novo método para upload da foto de perfil
  static async uploadAvatar(req: Request, res: Response) {
    try {
      const id = req.params.id as string;

      if (!req.file) {
        return res.status(400).json({ error: "Nenhuma imagem foi enviada." });
      }

      const imageUrl = req.file.path; // URL do Cloudinary

      const user = await prisma.user.update({
        where: { id },
        data: { avatar: imageUrl },
      });

      const { password: _, ...userSemSenha } = user;

      return res.json({ 
        message: "Avatar atualizado com sucesso na nuvem!",
        user: userSemSenha 
      });
    } catch (error) {
      console.error("Erro no upload do avatar:", error);
      return res.status(500).json({ error: "Erro ao atualizar foto de perfil." });
    }
  }
}