import type { Request, Response } from "express";
import { prisma } from '../lib/prisma.js'; // Reutilizando a instância central
import crypto from "crypto";

export class ChamadoController {
  static async index(req: Request, res: Response) {
    try {
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      let whereClause: any = {};

      // Trava Multi-Tenant: O gestor só vê os tickets abertos pela escola dele
      if (user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.json([]); 
        }
        whereClause = { escolaId: user.escolaId };
      }

      const chamados = await prisma.chamado.findMany({
        where: whereClause,
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
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const dados = req.body;
      let escolaId = req.body.escolaId;

      // Trava de Criação: O ticket fica permanentemente vinculado à escola do gestor logado
      if (user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.status(403).json({ error: "Gestor sem escola vinculada não pode abrir chamados." });
        }
        escolaId = user.escolaId;
      }

      const novoChamado = await prisma.chamado.create({
        data: {
          titulo: dados.titulo,
          descricao: dados.descricao,
          escola: dados.escola, // Mantém o nome da escola em texto se o frontend exigir
          escolaId, // Campo relacional crucial para o isolamento
          solicitante: dados.solicitante,
          categoria: dados.categoria,
          prioridade: dados.prioridade || "Normal",
          status: "Aberto",
          historico: [{
            id: crypto.randomUUID(), // Padronizando com randomUUID
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
      const id = req.params.id as string;
      const dados = req.body;
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const chamadoAtual = await prisma.chamado.findUnique({ where: { id } });
      
      if (!chamadoAtual) {
        return res.status(404).json({ error: "Chamado não encontrado" });
      }

      // Trava de Edição: Impede que um gestor injete mensagens num chamado de outra instituição
      if (user.role !== 'ADMIN') {
        // Asseguramos o isolamento validando o ID da escola vinculada ao chamado
        if ((chamadoAtual as any).escolaId !== user.escolaId) {
          return res.status(403).json({ error: "Sem permissão para atualizar este chamado." });
        }
      }

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