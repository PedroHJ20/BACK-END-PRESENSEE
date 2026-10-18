import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class EventController {
  // Lista todos os eventos para alimentar o calendário e a tabela
  static async index(req: Request, res: Response) {
    try {
      const events = await prisma.event.findMany({
        orderBy: { startDate: 'asc' }
      });
      return res.json(events);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar eventos do calendário.' });
    }
  }

  // Cria um novo evento (Botão "+ Novo evento")
  static async create(req: Request, res: Response) {
    const { title, startDate, endDate, type, excusesAbsence, audience } = req.body;

    try {
      const event = await prisma.event.create({
        data: {
          title,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          type,
          excusesAbsence,
          audience
        }
      });
      return res.status(201).json(event);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao criar evento.' });
    }
  }

  // Exclui um evento (Botão "Excluir" na tabela)
  static async delete(req: Request, res: Response) {
    const { id } = req.params;
    try {
      await prisma.event.delete({ where: { id: String(id) } });
      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao excluir evento.' });
    }
  }
}