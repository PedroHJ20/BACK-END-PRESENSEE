import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class ComunicadoController {
  static async index(req: Request, res: Response) {
    try {
      const comunicados = await prisma.comunicado.findMany({
        orderBy: { alteradoEm: "desc" }
      });
      return res.json(comunicados);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro ao buscar comunicados" });
    }
  }

  static async create(req: Request, res: Response) {
    try {
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
      return res.status(201).json(novoComunicado);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro ao criar comunicado" });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const dados = req.body;

      // Constrói os dados de atualização apenas com os campos que foram realmente enviados (perfeito para PATCH)
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

      return res.json(atualizado);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro ao atualizar comunicado" });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      await prisma.comunicado.delete({ where: { id } });
      return res.status(204).send();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro ao excluir comunicado" });
    }
  }
}