import type { Request, Response } from "express";
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const escolaDb = (prisma as any).escola;

export class SchoolController {
  static async create(req: Request, res: Response) {
    try {
      const { nome, municipio, rede, status } = req.body;
      
      const escola = await escolaDb.create({
        data: {
          nome,
          municipio,
          rede,
          status: status || "Pendente"
        }
      });
      
      return res.status(201).json(escola);
    } catch (error) {
      console.error("Erro ao criar escola:", error);
      return res.status(500).json({ error: "Erro interno ao criar a escola." });
    }
  }

  static async index(req: Request, res: Response) {
    try {
      const escolas = await escolaDb.findMany({
        include: { users: true } 
      });
      
      return res.json(escolas);
    } catch (error) {
      console.error("Erro ao buscar escolas:", error);
      return res.status(500).json({ error: "Erro interno ao listar as escolas." });
    }
  }

  static async updateStatus(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { status } = req.body;
      
      const escola = await escolaDb.update({
        where: { id },
        data: { status }
      });
      
      return res.json(escola);
    } catch (error) {
      console.error("Erro ao atualizar status da escola:", error);
      return res.status(500).json({ error: "Erro ao atualizar status." });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      
      await escolaDb.delete({ 
        where: { id } 
      });
      
      return res.status(204).send();
    } catch (error) {
      console.error("Erro ao excluir escola:", error);
      return res.status(500).json({ error: "Erro ao excluir escola." });
    }
  }
}