import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export class NotificacaoController {
  // Retorna todas as chaves já lidas pelo usuário autenticado
  static async listarLidas(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const registros = await prisma.notificacaoLida.findMany({
        where: { userId: user.id },
        select: { chaveLeitura: true },
      });

      return res.json(registros.map((r) => r.chaveLeitura));
    } catch (error) {
      console.error("Erro ao buscar notificações lidas:", error);
      return res.status(500).json({ error: "Erro ao buscar notificações lidas." });
    }
  }

  // Marca uma ou várias notificações como lidas para o usuário autenticado
  static async marcarComoLidas(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const { chaves, chave } = req.body;
      const listaChaves: string[] = Array.isArray(chaves)
        ? chaves.map(String).filter(Boolean)
        : chave
        ? [String(chave)]
        : [];

      if (listaChaves.length === 0) {
        return res.status(400).json({ error: "Nenhuma chave de notificação informada." });
      }

      await prisma.notificacaoLida.createMany({
        data: listaChaves.map((chaveLeitura) => ({
          userId: user.id,
          chaveLeitura,
        })),
        skipDuplicates: true,
      });

      return res.status(200).json({ ok: true, total: listaChaves.length });
    } catch (error) {
      console.error("Erro ao salvar leitura de notificações:", error);
      return res.status(500).json({ error: "Erro ao registrar leitura." });
    }
  }
}