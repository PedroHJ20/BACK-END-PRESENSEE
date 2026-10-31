import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

export class ChamadoController {
  static async index(req: Request, res: Response) {
    try {
      const chamados = await prisma.chamado.findMany({
        orderBy: { atualizadoEm: "desc" }
      });
      return res.json(chamados);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro ao buscar chamados" });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const dados = req.body;
      const novoChamado = await prisma.chamado.create({
        data: {
          titulo: dados.titulo,
          descricao: dados.descricao,
          escola: dados.escola,
          solicitante: dados.solicitante,
          categoria: dados.categoria,
          prioridade: dados.prioridade || "Normal",
          status: "Aberto",
          historico: [{
            id: "criacao",
            texto: "Chamado aberto",
            data: new Date().toISOString(),
            autor: dados.solicitante
          }]
        }
      });
      return res.status(201).json(novoChamado);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro ao criar chamado" });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      // Dizemos explicitamente ao TypeScript que o ID é uma string
      const id = req.params.id as string;
      const dados = req.body;

      // Busca o chamado atual para poder atualizar o JSON
      const chamadoAtual = await prisma.chamado.findUnique({ where: { id } });
      
      if (!chamadoAtual) {
        return res.status(404).json({ error: "Chamado não encontrado" });
      }

      // Prepara os arrays de JSON
      let mensagensAtuais = Array.isArray(chamadoAtual.mensagens) ? chamadoAtual.mensagens : [];
      let historicoAtual = Array.isArray(chamadoAtual.historico) ? chamadoAtual.historico : [];

      if (dados.novaMensagem) {
        mensagensAtuais.push(dados.novaMensagem);
        historicoAtual.push({
          id: crypto.randomUUID(),
          texto: "Nova interação",
          data: new Date().toISOString(),
          autor: dados.novaMensagem.autor
        });
      }

      const atualizado = await prisma.chamado.update({
        where: { id },
        data: {
          status: dados.status !== undefined ? dados.status : chamadoAtual.status,
          prioridade: dados.prioridade !== undefined ? dados.prioridade : chamadoAtual.prioridade,
          responsavel: dados.responsavel !== undefined ? dados.responsavel : chamadoAtual.responsavel,
          avaliacao: dados.avaliacao !== undefined ? dados.avaliacao : chamadoAtual.avaliacao,
          mensagens: mensagensAtuais,
          historico: historicoAtual
        }
      });

      return res.json(atualizado);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro ao atualizar chamado" });
    }
  }
}