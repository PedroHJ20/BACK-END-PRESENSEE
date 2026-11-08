import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import jwt from 'jsonwebtoken';

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

export const AttendanceController = {
  // 1. Registrar chamada automaticamente (via câmera)
  async create(req: Request, res: Response) {
    try {
      const { studentId, classId } = req.body;
      const user = await getLoggedUser(req);

      // Trava de segurança Multi-Tenant:
      // Verifica se o aluno que está recebendo a presença pertence à escola do gestor logado
      if (user && user.role !== 'ADMIN') {
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
      const user = await getLoggedUser(req);
      let filtroEscola = {};

      if (user && user.role !== 'ADMIN') {
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