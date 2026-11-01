import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class AuditoriaController {
  static async index(req: Request, res: Response) {
    try {
      const logs = await prisma.auditoria.findMany({
        orderBy: { criadoEm: "desc" },
        take: 500 // Limita aos últimos 500 registos por segurança e performance
      });
      return res.json(logs);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro ao buscar logs de auditoria" });
    }
  }

  // Método auxiliar para ser chamado por outros controllers para registar logs internamente
  static async logAction(tipo: string, titulo: string, descricao: string, responsavel: string, entidade: string) {
    try {
      await prisma.auditoria.create({
        data: { tipo, titulo, descricao, responsavel, entidade }
      });
    } catch (error) {
      console.error("Falha ao registrar auditoria:", error);
    }
  }
}