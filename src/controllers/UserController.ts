import type { Request, Response } from "express";
import { prisma } from '../lib/prisma.js';
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

      // Regra de Negócio: Gestores só podem ser criados junto com uma Escola no SchoolController
      if (role === 'MANAGER' || (!role && authUser.role === 'ADMIN')) {
        return res.status(400).json({ 
          error: "Um Gestor não pode ser criado isoladamente. Cadastre uma nova Escola para gerar o gestor vinculado." 
        });
      }

      // Trava Multi-Tenant para Criação
      if (authUser.role !== 'ADMIN') {
        if (!authUser.escolaId) {
          return res.status(403).json({ error: "Gestor sem escola vinculada não pode criar usuários." });
        }
        escolaId = authUser.escolaId;
      } else if (role !== 'ADMIN' && !escolaId) {
        return res.status(400).json({ error: "É obrigatório informar a escolaId para este perfil." });
      }

      const userExists = await prisma.user.findUnique({ where: { email } });
      if (userExists) {
        return res.status(400).json({ error: "Já existe um usuário cadastrado com este e-mail." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: role || "MONITOR",
          escolaId: role === 'ADMIN' ? null : escolaId
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

      if (authUser.role !== 'ADMIN') {
        if (!authUser.escolaId) {
          return res.json([]); 
        }
        whereClause = { escolaId: authUser.escolaId };
      }

      const users = await prisma.user.findMany({
        where: whereClause,
        include: { escola: true },
        orderBy: { createdAt: 'desc' }
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

  static async uploadAvatar(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const authUser = req.user;
      
      if (!authUser) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      if (authUser.role !== 'ADMIN' && authUser.id !== id) {
        const targetUser = await prisma.user.findUnique({ where: { id } });
        if (!targetUser || targetUser.escolaId !== authUser.escolaId) {
          return res.status(403).json({ error: "Sem permissão para alterar a foto deste usuário." });
        }
      }

      if (!req.file) {
        return res.status(400).json({ error: "Nenhuma imagem foi enviada." });
      }

      const imageUrl = req.file.path;

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

  static async delete(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const authUser = req.user;

      if (!authUser) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const targetUser = await prisma.user.findUnique({ where: { id } });
      if (!targetUser) {
        return res.status(404).json({ error: "Usuário não encontrado." });
      }

      // Impede exclusão avulsa de Gestor vinculado a uma escola
      if (targetUser.role === 'MANAGER' && targetUser.escolaId) {
        return res.status(400).json({ 
          error: "O gestor está estritamente vinculado à escola. Para removê-lo, exclua a escola correspondente." 
        });
      }

      if (authUser.role !== 'ADMIN' && targetUser.escolaId !== authUser.escolaId) {
        return res.status(403).json({ error: "Sem permissão para excluir este usuário." });
      }

      await prisma.user.delete({ where: { id } });
      return res.status(204).send();
    } catch (error) {
      console.error("Erro ao excluir usuário:", error);
      return res.status(500).json({ error: "Erro ao excluir usuário." });
    }
  }
}