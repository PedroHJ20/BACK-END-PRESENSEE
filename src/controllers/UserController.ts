import type { Request, Response } from "express";
import { prisma } from '../lib/prisma.js'; // <-- Reutiliza a instância central do Prisma!
import bcrypt from "bcryptjs";

export class UserController {
  static async create(req: Request, res: Response) {
    try {
      const authUser = req.user;
      
      if (!authUser) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const { name, email, password, role } = req.body;
      let escolaId = req.body.escolaId;

      // Trava Multi-Tenant para Criação
      if (authUser.role !== 'ADMIN') {
        if (!authUser.escolaId) {
          return res.status(403).json({ error: "Gestor sem escola vinculada não pode criar usuários." });
        }
        escolaId = authUser.escolaId; // Garante que o usuário criado pertença à mesma escola
      }

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
      const authUser = req.user;
      
      if (!authUser) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      let whereClause: any = {};

      // Filtro Multi-Tenant: Só lista usuários da própria escola
      if (authUser.role !== 'ADMIN') {
        if (!authUser.escolaId) {
          return res.json([]); 
        }
        whereClause = { escolaId: authUser.escolaId };
      }

      const users = await prisma.user.findMany({
        where: whereClause,
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
      const authUser = req.user;
      
      if (!authUser) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      // Trava de Edição: Permite se for o próprio usuário editando seu perfil, ou se forem da mesma escola
      if (authUser.role !== 'ADMIN' && authUser.id !== id) {
        const targetUser = await prisma.user.findUnique({ where: { id } });
        if (!targetUser || targetUser.escolaId !== authUser.escolaId) {
          return res.status(403).json({ error: "Sem permissão para editar o perfil deste usuário." });
        }
      }

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
      const authUser = req.user;
      
      if (!authUser) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      // Trava de Edição da Foto
      if (authUser.role !== 'ADMIN' && authUser.id !== id) {
        const targetUser = await prisma.user.findUnique({ where: { id } });
        if (!targetUser || targetUser.escolaId !== authUser.escolaId) {
          return res.status(403).json({ error: "Sem permissão para alterar a foto deste usuário." });
        }
      }

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