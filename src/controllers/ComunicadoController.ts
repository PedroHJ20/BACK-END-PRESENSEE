import type { Request, Response } from "express";
import { prisma } from '../lib/prisma.js';
import { AuditoriaController } from "./AuditoriaController.js";

export class ComunicadoController {
  static async index(req: Request, res: Response) {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      // Admin visualiza todos os comunicados (incluindo rascunhos)
      if (user.role === 'ADMIN') {
        const comunicados = await prisma.comunicado.findMany({
          orderBy: { alteradoEm: "desc" }
        });
        return res.json(comunicados);
      }

      // Gestor/Monitor visualiza apenas comunicados Publicados e direcionados à sua escola
      const comunicadosPublicados = await prisma.comunicado.findMany({
        where: {
          status: "Publicado"
        },
        orderBy: { publicadoEm: "desc" }
      });

      let nomeEscolaUsuario = "";
      if (user.escolaId) {
        const escola = await prisma.escola.findUnique({
          where: { id: user.escolaId },
          select: { nome: true }
        });
        nomeEscolaUsuario = escola?.nome || "";
      }

      const filtrados = comunicadosPublicados.filter((c) => {
        if (c.publico === "Todas as escolas" || !c.escolas || c.escolas.length === 0) {
          return true;
        }
        return (
          (user.escolaId && c.escolas.includes(user.escolaId)) ||
          (nomeEscolaUsuario && c.escolas.includes(nomeEscolaUsuario))
        );
      });

      return res.json(filtrados);
    } catch (error) {
      console.error("Erro ao buscar comunicados:", error);
      return res.status(500).json({ error: "Erro ao buscar comunicados" });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user || user.role !== 'ADMIN') {
        return res.status(403).json({ error: "Apenas administradores podem criar comunicados." });
      }

      const dados = req.body;
      const novoComunicado = await prisma.comunicado.create({
        data: {
          titulo: dados.titulo,
          mensagem: dados.mensagem,
          tipo: dados.tipo || "Informativo",
          publico: dados.publico || "Todas as escolas",
          escolas: Array.isArray(dados.escolas) ? dados.escolas : [],
          status: dados.status || "Rascunho",
          inicio: dados.inicio ? new Date(dados.inicio) : null,
          fim: dados.fim ? new Date(dados.fim) : null,
          publicadoEm: dados.status === "Publicado" ? new Date() : null,
        }
      });

      await AuditoriaController.logAction(
        "COMUNICADO",
        `Comunicado criado: ${novoComunicado.titulo}`,
        `Status: ${novoComunicado.status} | Público: ${novoComunicado.publico}`,
        "Administrador",
        "Comunicado"
      );

      return res.status(201).json(novoComunicado);
    } catch (error) {
      console.error("Erro ao criar comunicado:", error);
      return res.status(500).json({ error: "Erro ao criar comunicado" });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user || user.role !== 'ADMIN') {
        return res.status(403).json({ error: "Apenas administradores podem editar comunicados." });
      }

      const id = req.params.id as string;
      const dados = req.body;
      const updateData: any = {};

      if (dados.titulo !== undefined) updateData.titulo = dados.titulo;
      if (dados.mensagem !== undefined) updateData.mensagem = dados.mensagem;
      if (dados.tipo !== undefined) updateData.tipo = dados.tipo;
      if (dados.publico !== undefined) updateData.publico = dados.publico;
      if (dados.status !== undefined) updateData.status = dados.status;
      
      if (dados.escolas !== undefined) {
        updateData.escolas = Array.isArray(dados.escolas) ? dados.escolas : [];
      }
      if (dados.inicio !== undefined) {
        updateData.inicio = dados.inicio ? new Date(dados.inicio) : null;
      }
      if (dados.fim !== undefined) {
        updateData.fim = dados.fim ? new Date(dados.fim) : null;
      }
      if (dados.status === "Publicado") {
        updateData.publicadoEm = new Date();
      }

      const atualizado = await prisma.comunicado.update({
        where: { id },
        data: updateData
      });

      if (dados.status === "Publicado") {
        await AuditoriaController.logAction(
          "COMUNICADO",
          `Comunicado publicado: ${atualizado.titulo}`,
          `Enviado para: ${atualizado.publico}`,
          "Administrador",
          "Comunicado"
        );
      }

      return res.json(atualizado);
    } catch (error) {
      console.error("Erro ao atualizar comunicado:", error);
      return res.status(500).json({ error: "Erro ao atualizar comunicado" });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user || user.role !== 'ADMIN') {
        return res.status(403).json({ error: "Apenas administradores podem excluir comunicados." });
      }

      const id = req.params.id as string;
      await prisma.comunicado.delete({ where: { id } });
      return res.status(204).send();
    } catch (error) {
      console.error("Erro ao excluir comunicado:", error);
      return res.status(500).json({ error: "Erro ao excluir comunicado" });
    }
  }
}