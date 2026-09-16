import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

export const AttendanceController = {
  // Registrar chamada e gerar alerta se houver falta
  async create(req: Request, res: Response) {
    try {
      const { studentId, classId, status } = req.body;
      
      const attendance = await prisma.attendance.create({
        data: {
          studentId,
          classId,
          status, // PRESENT, ABSENT ou EXCUSED
        }
      });

      // Lógica de Evasão: Se faltou, gera alerta automático
      if (status === 'ABSENT') {
        await prisma.alert.create({
          data: {
            reason: "Falta registrada hoje. Possível risco de evasão.",
            studentId: studentId,
            status: "PENDING"
          }
        });
      }
      
      res.status(201).json({ 
        message: "Chamada registrada com sucesso!", 
        attendance 
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Erro ao registrar a frequência." });
    }
  },

  // Listar todos os alertas de evasão para a coordenação
  async listAlerts(req: Request, res: Response) {
    try {
      const alerts = await prisma.alert.findMany({
        include: {
          student: true 
        }
      });
      res.json(alerts);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Erro ao buscar alertas." });
    }
  }
};