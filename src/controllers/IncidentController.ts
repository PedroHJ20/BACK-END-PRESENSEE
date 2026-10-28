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
    const { type, description, texto, studentId, date, title, priority, category, isPending } = req.body;

    try {
      let finalType = type;
      if (!finalType) {
          finalType = isPending ? 'PENDENCIA' : 'NOTA';
      }

      let descFinal = description || texto || '';
      
      if (title && !descFinal.includes(title)) descFinal = `[${title}] ${descFinal}`;
      if (category && !descFinal.includes(category)) descFinal = `[${category}] ${descFinal}`;
      if (priority && !descFinal.includes(priority)) descFinal = `[Prioridade: ${priority}] ${descFinal}`;

      const payloadData: any = {
        type: finalType,
        description: descFinal.trim() || 'Sem descrição',
      };

      if (studentId) payloadData.studentId = studentId;
      if (date) payloadData.date = new Date(date);

      const queryOptions: any = { data: payloadData };
      
      if (studentId) {
        queryOptions.include = {
          student: { include: { class: true } }
        };
      }

      const incident = await prisma.incident.create(queryOptions);
      return res.status(201).json(incident);
    } catch (error) {
      console.error("Erro Prisma ao salvar ocorrencia:", error);
      return res.status(500).json({ error: 'Erro ao registrar ocorrência.' });
    }
  }

  static async update(req: Request, res: Response) {
    const id = req.params.id as string;
    const { resolved, description, texto, feita } = req.body;
    
    try {
      const updateData: any = {};
      
      const desc = description !== undefined ? description : texto;
      if (desc !== undefined) updateData.description = desc;
      
      const estadoResolvido = resolved !== undefined ? resolved : feita;
      if (estadoResolvido === true) updateData.type = 'RESOLVIDO';
      if (estadoResolvido === false) updateData.type = 'PENDENCIA';

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