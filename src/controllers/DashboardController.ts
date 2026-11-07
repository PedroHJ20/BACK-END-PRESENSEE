import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export class DashboardController {
  static async getSummary(req: Request, res: Response) {
    try {
      let userId = null;
      
      const authHeader = req.headers.authorization;
      // Garante que o cabeçalho existe e tem o formato correto "Bearer <token>"
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        
        // Só tenta decodificar se o token realmente existir
        if (token) {
          try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
            userId = decoded.id;
          } catch (e) {
            console.error("Dashboard: Erro ao decodificar token", e);
          }
        }
      }

      // Fallback caso o middleware injete a variável de outra forma
      if (!userId) {
        userId = (req as any).userId || (req as any).user?.id || (req as any).usuarioId;
      }

      let filtroEscola = {}; 

      if (userId) {
        const usuarioLogado = await prisma.user.findUnique({ where: { id: userId } });
        
        if (usuarioLogado && usuarioLogado.role !== 'ADMIN') {
          if (!usuarioLogado.escolaId) {
            return res.json({
              totalAlunos: 0, alunosAltoRisco: 0, alunosRisco: 0, alunosBaixoRisco: 0,
              taxaFrequenciaGeral: 100, turmas: [], evolucaoRisco: [], frequenciaPorSemana: []
            });
          }
          filtroEscola = { escolaId: usuarioLogado.escolaId };
        }
      } else {
        console.warn("Dashboard: Requisição processada sem identificação de utilizador.");
      }

      const students = await prisma.student.findMany({
        where: filtroEscola,
        include: {
          attendances: true,
          alerts: { where: { status: 'PENDING' } },
          class: true
        }
      });

      const classes = await prisma.class.findMany({
        where: filtroEscola,
        include: {
          students: {
            include: { attendances: true }
          }
        }
      });

      let highRisk = 0;
      let mediumRisk = 0;
      let lowRisk = 0;
      let totalPresent = 0;
      let totalAttendances = 0;

      students.forEach((student) => {
        const total = student.attendances.length;
        const present = student.attendances.filter((a) => a.status === 'PRESENT').length;
        totalAttendances += total;
        totalPresent += present;

        const freq = total > 0 ? (present / total) * 100 : 100;

        if (freq < 70 || student.alerts.length >= 2) {
          highRisk++;
        } else if (freq < 85 || student.alerts.length === 1) {
          mediumRisk++;
        } else {
          lowRisk++;
        }
      });

      const overallFrequency = totalAttendances > 0
        ? Math.round((totalPresent / totalAttendances) * 100)
        : 100;

      const classesSummary = classes.map((c) => {
        let classPresent = 0;
        let classTotal = 0;

        c.students.forEach((s) => {
          classTotal += s.attendances.length;
          classPresent += s.attendances.filter((a) => a.status === 'PRESENT').length;
        });

        const frequency = classTotal > 0 ? Math.round((classPresent / classTotal) * 100) : 100;

        return {
          turma: c.name,
          frequencia: frequency
        };
      });

      return res.json({
        totalAlunos: students.length,
        alunosAltoRisco: highRisk,
        alunosRisco: mediumRisk,
        alunosBaixoRisco: lowRisk,
        taxaFrequenciaGeral: overallFrequency,
        turmas: classesSummary,
        evolucaoRisco: [
          { periodo: "Ago", risco: 12 },
          { periodo: "Set", risco: 15 },
          { periodo: "Out", risco: students.length ? Math.round((highRisk / students.length) * 100) : 0 }
        ],
        frequenciaPorSemana: [
          { dia: "Seg", frequencia: overallFrequency },
          { dia: "Ter", frequencia: overallFrequency },
          { dia: "Qua", frequencia: overallFrequency },
          { dia: "Qui", frequencia: overallFrequency },
          { dia: "Sex", frequencia: overallFrequency }
        ]
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar dados do dashboard.' });
    }
  }
}