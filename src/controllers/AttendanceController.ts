import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

export const AttendanceController = {
  // 0. Listar chamadas (usado pelo Totem para sincronizar presenças do dia)
  async index(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const { classId, date, studentId } = req.query;
      const where: any = {};

      if (user.role !== 'ADMIN') {
        if (!user.escolaId) return res.json([]);
        where.student = { escolaId: user.escolaId };
      }

      if (classId && classId !== 'TODAS') {
        where.classId = String(classId);
      }

      if (studentId) {
        where.studentId = String(studentId);
      }

      if (date) {
        const dataBase = new Date(`${String(date)}T00:00:00.000-03:00`);
        const fimDia = new Date(`${String(date)}T23:59:59.999-03:00`);
        if (!isNaN(dataBase.getTime())) {
          where.date = { gte: dataBase, lte: fimDia };
        }
      }

      const attendances = await prisma.attendance.findMany({
        where,
        orderBy: { date: 'desc' },
      });

      return res.json(attendances);
    } catch (error) {
      console.error("Erro ao listar chamadas:", error);
      return res.status(500).json({ error: "Erro ao buscar registros de frequência." });
    }
  },

  // 1. Registrar chamada automaticamente (via câmera) com proteção anti-duplicidade no dia
  async create(req: Request, res: Response) {
    try {
      const { studentId, classId, status } = req.body;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      if (!studentId) {
        return res.status(400).json({ error: "O ID do aluno (studentId) é obrigatório." });
      }

      const student = await prisma.student.findUnique({
        where: { id: String(studentId) },
      });

      if (!student) {
        return res.status(404).json({ error: "Aluno não encontrado." });
      }

      // Trava de segurança Multi-Tenant
      if (user.role !== 'ADMIN' && student.escolaId !== user.escolaId) {
        return res.status(403).json({ error: "Acesso negado. O aluno não pertence à sua instituição." });
      }

      // Garante o classId real do aluno mesmo se o Totem estiver em modo "TODAS"
      const turmaFinalId =
        classId && String(classId) !== 'TODAS' ? String(classId) : student.classId;

      // Define o intervalo do dia atual no fuso de Brasília/Recife (-03:00)
      const agora = new Date();
      const dataLocalStr = agora.toLocaleDateString('en-CA', { timeZone: 'America/Recife' }); // YYYY-MM-DD
      const inicioDia = new Date(`${dataLocalStr}T00:00:00.000-03:00`);
      const fimDia = new Date(`${dataLocalStr}T23:59:59.999-03:00`);

      // Verifica se já existe registro de frequência para este aluno hoje
      const registroExistente = await prisma.attendance.findFirst({
        where: {
          studentId: student.id,
          date: {
            gte: inicioDia,
            lte: fimDia,
          },
        },
      });

      if (registroExistente) {
        return res.status(200).json({
          message: "Frequência já registrada anteriormente hoje!",
          alreadyRegistered: true,
          attendance: registroExistente,
        });
      }

      const attendance = await prisma.attendance.create({
        data: {
          studentId: student.id,
          classId: turmaFinalId,
          status: status || 'PRESENT',
          date: agora,
        },
      });

      return res.status(201).json({
        message: "Presença registrada com sucesso pela câmera!",
        attendance,
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
          return res.json([]);
        }
        filtroEscola = {
          student: {
            escolaId: user.escolaId,
          },
        };
      }

      const alerts = await prisma.alert.findMany({
        where: filtroEscola,
        include: {
          student: true,
        },
      });

      return res.json(alerts);
    } catch (error) {
      console.error("Erro ao buscar alertas:", error);
      return res.status(500).json({ error: "Erro ao buscar alertas." });
    }
  },
};