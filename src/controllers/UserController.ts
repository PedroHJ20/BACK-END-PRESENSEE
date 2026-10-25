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
}