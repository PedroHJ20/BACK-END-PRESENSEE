import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class IncidentController {
  static async index(req: Request, res: Response) {
    try {
      const studentId = req.query.studentId as string | undefined;
      const whereClause = studentId ? { studentId } : {};

      const incidents = await prisma.incident.findMany({
        where: whereClause,
        include: {
          student: {
            include: { class: true }
          }
        },
        orderBy: { date: 'desc' }
      });
      return res.json(incidents);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar intervenções.' });
    }
  }

  static async create(req: Request, res: Response) {
    const { type, description, studentId, date, category, title, isPending, priority } = req.body;

    try {
      const payloadData: any = {
        type,
        description,
      };

      if (studentId) payloadData.studentId = studentId;
      if (date) payloadData.date = new Date(date);
      if (category) payloadData.category = category;
      if (title) payloadData.title = title;
      if (isPending !== undefined) payloadData.isPending = isPending;
      if (priority) payloadData.priority = priority;

      const incident = await prisma.incident.create({
        data: payloadData,
        include: {
          student: {
            include: { class: true }
          }
        }
      });
      return res.status(201).json(incident);
    } catch (error) {
      console.error("Erro Prisma ao salvar:", error);
      return res.status(500).json({ error: 'Erro ao registrar intervenção ou anotação.' });
    }
  }

  static async update(req: Request, res: Response) {
    const id = req.params.id as string;
    const { resolved, priority, feita } = req.body;
    
    try {
      const updateData: any = {};
      if (resolved !== undefined) updateData.resolved = resolved;
      if (feita !== undefined) updateData.resolved = feita; 
      if (priority !== undefined) updateData.priority = priority;

      const incident = await prisma.incident.update({
        where: { id },
        data: updateData
      });
      return res.json(incident);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar registro.' });
    }
  }

  static async delete(req: Request, res: Response) {
    const id = req.params.id as string;
    
    try {
      await prisma.incident.delete({ where: { id } });
      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao excluir registro.' });
    }
  }
}