import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

export const AttendanceController = {
  // 1. Registrar chamada automaticamente (via câmera)
  async create(req: Request, res: Response) {
    try {
      const { studentId, classId } = req.body;
      
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      // Trava de segurança Multi-Tenant:
      // Verifica se o aluno que está recebendo a presença pertence à escola do gestor logado
      if (user.role !== 'ADMIN') {
        const student = await prisma.student.findUnique({ where: { id: studentId } });
        
        if (!student || student.escolaId !== user.escolaId) {
          return res.status(403).json({ error: "Acesso negado. O aluno não pertence à sua instituição." });
        }
      }
      
      const attendance = await prisma.attendance.create({
        data: {
          studentId,
          classId,
          status: 'PRESENT', // Assumimos PRESENTE automaticamente
          date: new Date()   // Carimba o dia e hora exatos do reconhecimento
        }
      });
      
      return res.status(201).json({ 
        message: "Presença registrada com sucesso pela câmera!", 
        attendance 
      });
    } catch (error) {
      console.error("Erro ao registrar presença:", error);
      return res.status(500).json({ error: "Erro ao processar o check-in da câmera." });
    }
  },

  // 2. Listar todos os alertas de evasão para a coordenação
  async listAlerts(req: Request, res: Response) {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      let filtroEscola = {};

      if (user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.json([]); // Retorna array vazio se o gestor não tiver escola
        }
        // Magia do Prisma: Filtra os alertas através da escola do Aluno associado
        filtroEscola = { 
          student: { 
            escolaId: user.escolaId 
          } 
        };
      }

      const alerts = await prisma.alert.findMany({
        where: filtroEscola, // <-- Aplica o filtro multi-tenant
        include: {
          student: true 
        }
      });
      
      return res.json(alerts);
    } catch (error) {
      console.error("Erro ao buscar alertas:", error);
      return res.status(500).json({ error: "Erro ao buscar alertas." });
    }
  }
};