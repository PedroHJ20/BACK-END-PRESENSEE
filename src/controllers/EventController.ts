import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class EventController {
  static async index(req: Request, res: Response) {
    try {
      const events = await prisma.event.findMany({
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
      return res.status(500).json({ error: 'Erro ao buscar eventos.' });
    }
  }

  static async create(req: Request, res: Response) {
    const { title, dates, type, allowance, audience } = req.body;

    try {
      const startDate = dates && dates.length > 0 ? new Date(dates[0]) : new Date();
      const endDate = dates && dates.length > 0 ? new Date(dates[dates.length - 1]) : new Date();
      const excusesAbsence = allowance !== 'nenhum';

      const event = await prisma.event.create({
        data: {
          title: title || 'Sem título',
          startDate,
          endDate,
          type: type || 'Outro',
          excusesAbsence,
          audience: audience || 'Toda a escola'
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
    const { title, dates, type, allowance, audience } = req.body;
    
    try {
      const updateData: any = {};
      if (title) updateData.title = title;
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
      return res.status(500).json({ error: 'Erro ao atualizar evento.' });
    }
  }

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