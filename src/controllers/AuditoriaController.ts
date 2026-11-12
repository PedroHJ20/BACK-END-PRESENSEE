import type { Request, Response } from "express";
import { prisma } from '../lib/prisma.js';

export class AuditoriaController {
  static async index(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user || user.role !== 'ADMIN') {
        return res.status(403).json({ error: "Acesso negado. Apenas administradores podem visualizar a auditoria." });
      }

      const logs = await prisma.auditoria.findMany({
        orderBy: { criadoEm: "desc" },
        take: 500
      });
      return res.json(logs);
    } catch (error) {
      console.error("Erro ao buscar logs de auditoria:", error);
      return res.status(500).json({ error: "Erro ao buscar logs de auditoria" });
    }
  }

  // Permite registrar auditoria via endpoint caso o front-end dispare eventos
  static async create(req: Request, res: Response) {
    try {
      const { tipo, titulo, descricao, responsavel, entidade } = req.body;
      const log = await prisma.auditoria.create({
        data: {
          tipo: tipo || "SISTEMA",
          titulo: titulo || "Ação registrada",
          descricao: descricao || "",
          responsavel: responsavel || "Sistema",
          entidade: entidade || "Geral"
        }
      });
      return res.status(201).json(log);
    } catch (error) {
      console.error("Erro ao criar log de auditoria:", error);
      return res.status(500).json({ error: "Erro ao registrar auditoria" });
    }
  }

  // Método auxiliar interno para ser chamado pelos outros controllers
  static async logAction(
    tipo: string,
    titulo: string,
    descricao: string,
    responsavel: string,
    entidade: string
  ) {
    try {
      await prisma.auditoria.create({
        data: { tipo, titulo, descricao, responsavel, entidade }
      });
    } catch (error) {
      console.error("Falha ao registrar auditoria:", error);
    }
  }
}