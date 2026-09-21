import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

export const AttendanceController = {
  // 1. Registrar chamada automaticamente (via câmera)
  async create(req: Request, res: Response) {
    try {
      // A câmera só precisa enviar quem é o aluno e de qual turma ele é.
      // O 'status' não é mais recebido, pois é sempre PRESENTE.
      const { studentId, classId } = req.body;
      
      const attendance = await prisma.attendance.create({
        data: {
          studentId,
          classId,
          status: 'PRESENT', // Assumimos PRESENTE automaticamente
          date: new Date()   // Carimba o dia e hora exatos do reconhecimento
        }
      });
      
      res.status(201).json({ 
        message: "Presença registrada com sucesso pela câmera!", 
        attendance 
      });
    } catch (error) {
      console.error("Erro ao registrar presença:", error);
      res.status(500).json({ error: "Erro ao processar o check-in da câmera." });
    }
  },

  // 2. Listar todos os alertas de evasão para a coordenação
  async listAlerts(req: Request, res: Response) {
    try {
      const alerts = await prisma.alert.findMany({
        include: {
          student: true 
        }
      });
      res.json(alerts);
    } catch (error) {
      console.error("Erro ao buscar alertas:", error);
      res.status(500).json({ error: "Erro ao buscar alertas." });
    }
  }
};