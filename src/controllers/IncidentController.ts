import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class IncidentController {
  // Lista todas as intervenções/registros
  static async index(req: Request, res: Response) {
    try {
      const incidents = await prisma.incident.findMany({
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

  // Cria uma nova intervenção ou anotação do monitor
  static async create(req: Request, res: Response) {
    const { type, description, studentId } = req.body;

    try {
      const incident = await prisma.incident.create({
        data: {
          type,
          description,
          studentId
        },
        include: {
          student: {
            include: { class: true }
          }
        }
      });
      return res.status(201).json(incident);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao registrar intervenção.' });
    }
  }
}