import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = (process.env.JWT_SECRET as string) || "fallback_secret";

// Função auxiliar de autenticação
async function getLoggedUser(req: Request) {
  let userId = null;
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        userId = decoded.id;
      } catch (e) {
        // Ignora erro
      }
    }
  }

  if (!userId) {
    userId = (req as any).userId || (req as any).user?.id || (req as any).usuarioId;
  }

  if (userId) {
    return await prisma.user.findUnique({ where: { id: userId } });
  }
  return null;
}

export class EventController {
  static async index(req: Request, res: Response) {
    try {
      const user = await getLoggedUser(req);
      let whereClause: any = {};

      // Filtro Multi-Tenant: Mostra apenas eventos da escola do gestor logado
      if (user && user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.json([]); 
        }
        whereClause = { escolaId: user.escolaId };
      }

      const events = await prisma.event.findMany({
        where: whereClause,
        orderBy: { startDate: 'asc' }
      });
      
      const formattedEvents = events.map(e => {
        const dates = [];
        let current = new Date(e.startDate);
        const end = new Date(e.endDate);
        
        while (current <= end && dates.length < 366) {
          dates.push(current.toISOString().split('T')[0]);
          current.setDate(current.getDate() + 1);
        }
        
        return {
          ...e,
          dates,
          allowance: e.excusesAbsence ? "escola" : "nenhum"
        };
      });
      
      return res.json(formattedEvents);
    } catch (error) {
      console.error("Erro ao buscar eventos:", error);
      return res.status(500).json({ error: 'Erro ao buscar eventos.' });
    }
  }

  static async create(req: Request, res: Response) {
    const { title, dates, type, allowance, audience, description, color } = req.body;

    try {
      const user = await getLoggedUser(req);
      let escolaId = req.body.escolaId;

      // Trava de criação Multi-Tenant
      if (user && user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.status(403).json({ error: "Gestor sem escola vinculada não pode criar eventos." });
        }
        escolaId = user.escolaId; 
      }

      const startDate = dates && dates.length > 0 ? new Date(dates[0]) : new Date();
      const endDate = dates && dates.length > 0 ? new Date(dates[dates.length - 1]) : new Date();
      const excusesAbsence = allowance !== 'nenhum';

      const event = await prisma.event.create({
        data: {
          title: title || 'Sem título',
          description: description || null,
          color: color || null,
          startDate,
          endDate,
          type: type || 'Outro',
          excusesAbsence,
          audience: audience || 'Toda a escola',
          escolaId // <-- Agora o evento ficará vinculado à escola do Josuke!
        }
      });
      return res.status(201).json(event);
    } catch (error) {
      console.error("Erro Prisma no Evento:", error);
      return res.status(500).json({ error: 'Erro ao criar evento.' });
    }
  }

  static async update(req: Request, res: Response) {
    const { id } = req.params;
    const { title, dates, type, allowance, audience, description, color } = req.body;
    
    try {
      const user = await getLoggedUser(req);

      // Trava de edição Multi-Tenant
      if (user && user.role !== 'ADMIN') {
        const eventoExistente = await prisma.event.findUnique({ where: { id: String(id) } });
        if (!eventoExistente || eventoExistente.escolaId !== user.escolaId) {
          return res.status(403).json({ error: "Sem permissão para editar este evento." });
        }
      }

      const updateData: any = {};
      if (title) updateData.title = title;
      if (description !== undefined) updateData.description = description; 
      if (color !== undefined) updateData.color = color;                   
      if (type) updateData.type = type;
      if (audience) updateData.audience = audience;
      if (allowance !== undefined) updateData.excusesAbsence = allowance !== 'nenhum';
      
      if (dates && dates.length > 0) {
        updateData.startDate = new Date(dates[0]);
        updateData.endDate = new Date(dates[dates.length - 1]);
      }

      const event = await prisma.event.update({
        where: { id: String(id) },
        data: updateData
      });
      return res.json(event);
    } catch (error) {
      console.error("Erro ao atualizar evento:", error);
      return res.status(500).json({ error: 'Erro ao atualizar evento.' });
    }
  }

  static async delete(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const user = await getLoggedUser(req);

      // Trava de exclusão Multi-Tenant
      if (user && user.role !== 'ADMIN') {
        const eventoExistente = await prisma.event.findUnique({ where: { id: String(id) } });
        if (!eventoExistente || eventoExistente.escolaId !== user.escolaId) {
          return res.status(403).json({ error: "Sem permissão para excluir este evento." });
        }
      }

      await prisma.event.delete({ where: { id: String(id) } });
      return res.status(204).send();
    } catch (error) {
      console.error("Erro ao deletar evento:", error);
      return res.status(500).json({ error: 'Erro ao excluir evento.' });
    }
  }
}